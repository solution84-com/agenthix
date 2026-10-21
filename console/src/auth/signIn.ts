/**
 * Signing in (spec §7, plan 3.8): the Fleet Console has no accounts. It asks hq whether the username and password
 * are right (`signIn.check`) and lets in only an account that holds the fleet admin role. It keeps no password.
 * While hq does not answer nobody can sign in, and the answer says what is left to do on the machine.
 *
 * Failed attempts are limited per username and overall, so the console is not a way to guess hq passwords faster
 * than hq's own sign-in allows.
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

export class SignIn {
  private failures: { at: number; username: string }[] = []

  constructor(
    private readonly link: HqLink,
    private readonly activity: Activity,
    private readonly machineName: string,
    private readonly now: () => number = Date.now,
  ) {}

  async attempt(body: unknown): Promise<SignInOutcome> {
    const outcome = await this.checkLogin(body)
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
    const login = await this.checkLogin(body)
    const wrong: SignInOutcome = { ok: false, status: 401, code: 'wrong', message: 'That username, password and code do not match.' }
    const b = body as Record<string, unknown>
    if (!login.ok) {
      if (login.code === 'not_fleet_admin') this.failed((b.username as string).trim())
      return login.code === 'not_fleet_admin' || login.code === 'wrong' ? wrong : login
    }
    const input = {
      ...(typeof b.code === 'string' ? { code: b.code } : {}),
      ...(typeof b.recoveryCode === 'string' ? { recoveryCode: b.recoveryCode } : {}),
    }
    const username = (b.username as string).trim()
    const check = authenticators.check(login.user.id, input)
    if (check === 'wrong') {
      this.failed(username)
      return wrong
    }
    if (check === 'none') {
      this.failed(username)
      return { ok: false, status: 401, code: 'no_code', message: 'No authenticator code is set up for you on this Fleet Console yet.' }
    }
    const { user } = login
    if (check === 'claimed') {
      await this.activity.record(user.id, 'remoteAccess.authenticatorClaimed',
        `${user.name} set up an authenticator code for signing in through remote access to the Fleet Console on ${this.machineName}.`, true)
    }
    await this.activity.record(user.id, 'signedIn', `On ${this.machineName}, through remote access`, false)
    return login
  }

  /** hq's word on the username and password, and that the account holds the fleet admin role. */
  private async checkLogin(body: unknown): Promise<SignInOutcome> {
    const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const username = typeof b.username === 'string' ? b.username.trim() : ''
    const password = typeof b.password === 'string' ? b.password : ''
    if (!username || !password || username.length > 200 || password.length > 1024) {
      return { ok: false, status: 400, code: 'malformed', message: 'Give your HQ username and password.' }
    }
    if (this.limited(username)) {
      return { ok: false, status: 429, code: 'too_many', message: 'Too many attempts to sign in. Wait a few minutes, then try again.' }
    }
    if (this.link.state !== 'connected') return this.unreachable()

    let answer
    try {
      answer = await this.link.call('signIn.check', { username, password })
    } catch (err) {
      if (err instanceof HqUnavailableError) return this.unreachable()
      return { ok: false, status: 503, code: 'failed', message: 'HQ could not check your login. Try again in a moment.' }
    }
    if (!answer || answer.ok !== true || !answer.user || typeof answer.user.id !== 'string') {
      this.failed(username)
      return { ok: false, status: 401, code: 'wrong', message: 'That username and password do not match an HQ account.' }
    }
    if (answer.user.fleetAdmin !== true) {
      return {
        ok: false, status: 403, code: 'not_fleet_admin',
        message: "This account isn't a fleet admin. A fleet admin can give you the role in the Fleet Console.",
      }
    }
    return { ok: true, user: { id: answer.user.id, name: typeof answer.user.name === 'string' ? answer.user.name : username } }
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

  private failed(username: string): void {
    this.failures.push({ at: this.now(), username: username.toLowerCase() })
  }
}
