/**
 * Signing in to hq with an Agenthix account (pre-release spec C2), over the connection: OpenID Connect's
 * authorization code flow with PKCE, hq being the client the connection registered (core/src/cloud/signIn.ts).
 *
 * - **Linking**, in Settings › Sign-in: a person signed in to hq confirms their password and goes to Cloud; the
 *   account they come back as is kept with theirs (its issuer and subject, nothing else).
 * - **Signing in** with a linked account makes hq's own session, as a password does, so people already in keep
 *   working while Cloud is away. An account not linked is refused; nothing here ever makes an account.
 * - **Never the only way in**: a person always keeps their password.
 * - hq asks Cloud for nothing while it is not connected; the page is told `connected` and the server refuses.
 */
import {
  cloudAuthorizeUrl, cloudIssuer, cloudSignInRedirectUri, isCloudAuthorizationCode, isCloudFlowValue, type CloudUrl,
} from '@agenthix/core'
import { checkCloudIdToken, pkceChallengeOf } from '@agenthix/core/cloud-crypto'
import type { CloudConnection } from './cloudConnection'
import type { FlowPurpose, SignInFlows } from './signInFlows'

export type CloudLinkStore = {
  /** The person this account is linked to, and whether they may still sign in. */
  personWith(issuer: string, subject: string): Promise<{ userId: string; active: boolean } | null>
  link(userId: string, issuer: string, subject: string): Promise<'linked' | 'taken'>
}

export type CloudSignInDeps = {
  connection: () => Pick<CloudConnection, 'clientId' | 'exchangeSignInCode'> | null
  base: CloudUrl | null
  hqAddress: () => string
  links: CloudLinkStore
  flows: SignInFlows
  /** Whether `password` is the person's own; counts wrong ones against a limit. */
  passwordIsRight: (userId: string, password: string) => Promise<boolean>
  /** hq's own session for the person, as a password sign-in makes: its id. */
  makeSession: (userId: string) => Promise<string>
  now?: () => number
}

export type CloudSignInRefusalCode =
  | 'not_connected' | 'not_signed_in' | 'wrong_password' | 'expired' | 'cancelled' | 'not_confirmed' | 'not_linked'
  | 'removed' | 'taken' | 'other_person' | 'bad_request'

/** A refusal for a person, in their words, with the HTTP status it is answered with. */
export class CloudSignInRefusal extends Error {
  constructor(readonly status: number, readonly code: CloudSignInRefusalCode, message: string) {
    super(message)
  }
}

export const CLOUD_SIGN_IN_WORDS = {
  notConnected: 'Signing in with Agenthix Cloud is off: this HQ is not connected to Agenthix Cloud.',
  notLinked: 'This Agenthix account is not linked to anyone in this HQ. Sign in with your username and password, then link it in Settings › Sign-in first.',
  expired: 'This sign-in ran out of time or was started in another tab. Start again.',
  cancelled: 'The sign-in was not completed on Agenthix Cloud. Start again.',
  notConfirmed: 'Agenthix Cloud did not confirm this sign-in. Start again.',
  removed: 'This account has been removed from the organisation.',
  taken: 'That Agenthix account is already linked to someone else in this HQ.',
  otherPerson: 'Sign in to HQ as the person who started linking, then try again.',
  wrongPassword: 'Your password is not right.',
} as const

export type FinishInput = { state?: unknown; binding?: unknown; code?: unknown; error?: unknown }
export type FinishOutcome = { kind: 'signedIn'; sessionId: string } | { kind: 'linked' }

export class CloudSignIn {
  constructor(private readonly deps: CloudSignInDeps) {}

  /** Whether signing in with Cloud works now: hq is connected. Public, so it says nothing more. */
  async connected(): Promise<boolean> {
    return (await this.clientId()) !== null
  }

  startSignIn(): Promise<{ authorizeUrl: string; binding: string }> {
    return this.start({ kind: 'signIn' })
  }

  async startLink(userId: string | null, password: unknown): Promise<{ authorizeUrl: string; binding: string }> {
    if (!userId) throw new CloudSignInRefusal(401, 'not_signed_in', CLOUD_SIGN_IN_WORDS.otherPerson)
    // A session left open is not enough to tie another account to someone: the password is asked again.
    if (typeof password !== 'string' || !password || !(await this.deps.passwordIsRight(userId, password))) {
      throw new CloudSignInRefusal(400, 'wrong_password', CLOUD_SIGN_IN_WORDS.wrongPassword)
    }
    return this.start({ kind: 'link', userId })
  }

  /** The person's browser is back from Cloud: the code exchanged, the ID token checked, then a session or a link. */
  async finish(input: FinishInput, signedInUserId: string | null): Promise<FinishOutcome> {
    if (!isCloudFlowValue(input.state) || typeof input.binding !== 'string') throw refusal('expired')
    const flow = this.deps.flows.take(input.state, input.binding)
    if (!flow) throw refusal('expired')
    if (input.error !== undefined) throw refusal('cancelled')
    if (!isCloudAuthorizationCode(input.code)) throw refusal('notConfirmed')
    if (flow.purpose.kind === 'link' && flow.purpose.userId !== signedInUserId) throw refusal('otherPerson')

    const connection = this.deps.connection()
    const clientId = await connection?.clientId()
    if (!connection || !clientId || !this.deps.base) throw refusal('notConnected')
    const outcome = await connection.exchangeSignInCode({ code: input.code, redirectUri: this.redirectUri(), codeVerifier: flow.verifier })
    if (outcome.kind === 'notConnected' || outcome.kind === 'revoked') throw refusal('notConnected')
    if (outcome.kind === 'refused') throw refusal('notConfirmed')

    const issuer = cloudIssuer(this.deps.base)
    const check = checkCloudIdToken(outcome.idToken, { issuer, clientId, nonce: flow.nonce }, (this.deps.now ?? Date.now)())
    if (!check.ok) throw refusal('notConfirmed')

    if (flow.purpose.kind === 'link') {
      if ((await this.deps.links.link(flow.purpose.userId, issuer, check.subject)) === 'taken') throw refusal('taken')
      return { kind: 'linked' }
    }
    const person = await this.deps.links.personWith(issuer, check.subject)
    if (!person) throw refusal('notLinked')
    if (!person.active) throw refusal('removed')
    return { kind: 'signedIn', sessionId: await this.deps.makeSession(person.userId) }
  }

  private async clientId(): Promise<string | null> {
    if (!this.deps.base) return null
    return (await this.deps.connection()?.clientId()) ?? null
  }

  /** hq's address as Cloud registered it, with the sign-in path: Cloud sends the browser back nowhere else. */
  private redirectUri(): string {
    return cloudSignInRedirectUri(this.deps.hqAddress())
  }

  private async start(purpose: FlowPurpose): Promise<{ authorizeUrl: string; binding: string }> {
    const clientId = await this.clientId()
    if (!clientId || !this.deps.base) throw refusal('notConnected')
    const { flow, binding } = this.deps.flows.start(purpose)
    const authorizeUrl = cloudAuthorizeUrl(this.deps.base, {
      client_id: clientId, redirect_uri: this.redirectUri(), state: flow.state, nonce: flow.nonce,
      code_challenge: await pkceChallengeOf(flow.verifier),
    })
    return { authorizeUrl, binding }
  }
}

const REFUSALS = {
  notConnected: [409, 'not_connected'],
  expired: [400, 'expired'],
  cancelled: [400, 'cancelled'],
  notConfirmed: [400, 'not_confirmed'],
  notLinked: [403, 'not_linked'],
  removed: [403, 'removed'],
  taken: [409, 'taken'],
  otherPerson: [403, 'other_person'],
} as const satisfies Partial<Record<keyof typeof CLOUD_SIGN_IN_WORDS, readonly [number, CloudSignInRefusalCode]>>

function refusal(which: keyof typeof REFUSALS): CloudSignInRefusal {
  const [status, code] = REFUSALS[which]
  return new CloudSignInRefusal(status, code, CLOUD_SIGN_IN_WORDS[which])
}
