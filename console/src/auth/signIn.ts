/**
 * Signing in (spec §7, plan 3.8): the Fleet Console has no accounts. It asks hq whether the username and password
 * are right (`signIn.check`) and lets in only an account that holds the fleet admin role. It keeps no password.
 * While hq does not answer nobody can sign in, and the answer says what is left to do on the machine.
 *
 * Failed attempts are limited per username and overall, so the console is not a way to guess hq passwords faster
 * than hq's own sign-in allows. An attempt counts from the moment it is let through, before hq answers, and is given
 * back only when it turns out right (or hq never answered): requests that arrive together cannot all pass the limit.
 */
import { BRANDING } from '@agenthix/core'
import type { Activity } from '../activity'
import { HqUnavailableError, type HqLink } from '../hq/link'
import type { Authenticators } from './authenticators'
import type { SessionUser } from './sessions'

const WINDOW_MS = 15 * 60_000
const MAX_FAILURES_PER_USERNAME = 10
const MAX_FAILURES_OVERALL = 50

export type SignInOutcome =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 400 | 401 | 403 | 429 | 503; code: string; message: string }

export const HQ_NOT_ANSWERING = (machine: string) =>
  `HQ is not answering, so your HQ login cannot be checked. On ${machine}, run \`${BRANDING.cliCommand} status\` to see why, ` +
  `and \`${BRANDING.cliCommand} restore\` if HQ has to be brought back from a backup. Then try again.`

type Failure = { at: number; username: string }

/** An outcome, with the attempt it holds against the limit until the caller settles it: null when nothing is held. */
type Checked = { outcome: SignInOutcome; held: Failure | null }

export class SignIn {
  private failures: Failure[] = []

  constructor(
    private readonly link: HqLink,
    private readonly activity: Activity,
    private readonly machineName: string,
    private readonly now: () => number = Date.now,
  ) {}

  async attempt(body: unknown): Promise<SignInOutcome> {
    const { outcome, held } = await this.checkLogin(body)
    this.release(held)
    if (outcome.ok) await this.activity.record(outcome.user.id, 'signedIn', `On ${this.machineName}, at the machine or through an SSH tunnel`, false)
    return outcome
  }

  /**
   * Through remote access on a machine Cloud runs (pre-release spec B9): the HQ login of a fleet admin and a code from
   * their authenticator, or — with none of their own yet — from one Cloud handed over unclaimed, which becomes theirs.
   * A wrong password, a wrong code and an account that is not a fleet admin get the same answer, and each counts
   * against the limit, so the code is not a way to learn which passwords are right.
   */
  async attemptWithCode(body: unknown, authenticators: Authenticators): Promise<SignInOutcome> {
    const { outcome: login, held } = await this.checkLogin(body)
    const wrong: SignInOutcome = { ok: false, status: 401, code: 'wrong', message: 'That username, password and code do not match.' }
    const b = body as Record<string, unknown>
    if (!login.ok) {
      // A password that is right for an account that is no fleet admin counts too: the attempt held stays.
      if (login.code !== 'not_fleet_admin') this.release(held)
      return login.code === 'not_fleet_admin' || login.code === 'wrong' ? wrong : login
    }
    const input = {
      ...(typeof b.code === 'string' ? { code: b.code } : {}),
      ...(typeof b.recoveryCode === 'string' ? { recoveryCode: b.recoveryCode } : {}),
    }
    const check = authenticators.check(login.user.id, input)
    if (check === 'wrong') return wrong
    if (check === 'none') {
      return { ok: false, status: 401, code: 'no_code', message: 'No authenticator code is set up for you on this Fleet Console yet.' }
    }
    this.release(held)
    const { user } = login
    if (check === 'claimed') {
      await this.activity.record(user.id, 'remoteAccess.authenticatorClaimed',
        `${user.name} set up an authenticator code for signing in through remote access to the Fleet Console on ${this.machineName}.`, true)
    }
    await this.activity.record(user.id, 'signedIn', `On ${this.machineName}, through remote access`, false)
    return login
  }

  /** hq's word on the username and password, and that the account holds the fleet admin role. */
  private async checkLogin(body: unknown): Promise<Checked> {
    const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const username = typeof b.username === 'string' ? b.username.trim() : ''
    const password = typeof b.password === 'string' ? b.password : ''
    if (!username || !password || username.length > 200 || password.length > 1024) {
      return { outcome: { ok: false, status: 400, code: 'malformed', message: 'Give your HQ username and password.' }, held: null }
    }
    if (this.limited(username)) {
      return { outcome: { ok: false, status: 429, code: 'too_many', message: 'Too many attempts to sign in. Wait a few minutes, then try again.' }, held: null }
    }
    if (this.link.state !== 'connected') return { outcome: this.unreachable(), held: null }

    const held = this.hold(username)
    let answer
    try {
      answer = await this.link.call('signIn.check', { username, password })
    } catch (err) {
      this.release(held)
      if (err instanceof HqUnavailableError) return { outcome: this.unreachable(), held: null }
      return { outcome: { ok: false, status: 503, code: 'failed', message: 'HQ could not check your login. Try again in a moment.' }, held: null }
    }
    if (!answer || answer.ok !== true || !answer.user || typeof answer.user.id !== 'string') {
      return { outcome: { ok: false, status: 401, code: 'wrong', message: 'That username and password do not match an HQ account.' }, held: null }
    }
    if (answer.user.fleetAdmin !== true) {
      return {
        outcome: {
          ok: false, status: 403, code: 'not_fleet_admin',
          message: "This account isn't a fleet admin. A fleet admin can give you the role in the Fleet Console.",
        },
        held,
      }
    }
    return { outcome: { ok: true, user: { id: answer.user.id, name: typeof answer.user.name === 'string' ? answer.user.name : username } }, held }
  }

  private unreachable(): SignInOutcome {
    return { ok: false, status: 503, code: 'hq_unreachable', message: HQ_NOT_ANSWERING(this.machineName) }
  }

  private limited(username: string): boolean {
    const since = this.now() - WINDOW_MS
    this.failures = this.failures.filter(f => f.at > since)
    const key = username.toLowerCase()
    return this.failures.length >= MAX_FAILURES_OVERALL || this.failures.filter(f => f.username === key).length >= MAX_FAILURES_PER_USERNAME
  }

  /** Counts an attempt now, before hq answers. */
  private hold(username: string): Failure {
    const attempt = { at: this.now(), username: username.toLowerCase() }
    this.failures.push(attempt)
    return attempt
  }

  /** Gives an attempt back: it was right, or hq never judged it. */
  private release(attempt: Failure | null): void {
    if (attempt) this.failures = this.failures.filter(f => f !== attempt)
  }
}
