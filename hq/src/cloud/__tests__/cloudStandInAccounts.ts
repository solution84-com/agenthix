/**
 * The stand-in Cloud's accounts (core/src/cloud/signIn.ts): a person signing in at Cloud's authorize page, the code
 * exchanged at the token endpoint, and the downtime notices hq asks it to email. Strict where Cloud must be: a sign-in
 * goes back only to the redirect URI the client registered, exactly; a code is spent once, lapses, belongs to one
 * client and redirect URI, and needs its PKCE verifier; only a live client's access token is taken for a notice.
 */
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import {
  CLOUD_AUTHORIZE_PATH, cloudEndpoint, cloudIssuer, parseCloudAuthorizationCodeRequest, parseCloudAuthorizeRequest,
  parseCloudDowntimeNotice, parseCloudPledgeStatusRequest, type CloudDowntimeAccepted, type CloudDowntimeNotice, type CloudUrl,
} from '@agenthix/core'
import { pkceChallengeOf } from '@agenthix/core/cloud-crypto'
import { error, json } from './cloudStandIn'

type Code = {
  code: string
  clientId: string
  redirectUri: string
  challenge: string
  nonce: string
  subject: string
  expiresAt: number
  spent: boolean
}

export type CloudAccountsLinks = {
  /** The one redirect URI a live client registered; null for a client Cloud does not know, or revoked. */
  redirectUriOf(clientId: string): string | null
  /** The live client an access token was issued to; null for one Cloud did not issue or whose client was revoked. */
  clientOfToken(token: string): string | null
}

const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString('base64url')

export class CloudAccountsStandIn {
  readonly codes: Code[] = []
  /** Notices taken, newest last, with the client that sent each. */
  readonly notices: (CloudDowntimeNotice & { clientId: string })[] = []
  /** The pledge's current version, and each account's signature (a version and signer id) or withdrawal. */
  pledgeVersion = 1
  readonly pledges = new Map<string, { version: number; signerId: string } | 'withdrawn'>()
  /** Claims put into the next ID token in place of the right ones, once, to test hq's checks. */
  tamperNextIdToken: Record<string, unknown> | null = null
  private readonly signingKey = generateKeyPairSync('ed25519').privateKey

  constructor(private readonly base: CloudUrl, private readonly now: () => number, private readonly links: CloudAccountsLinks) {}

  /**
   * The person's browser at Cloud's authorize page, signed in there as `subject`: where Cloud sends it back to — the
   * redirect URI with a code and the state, or with an error when the request is not one Cloud takes.
   */
  async authorize(authorizeUrl: string, subject: string, answer: 'approve' | 'deny' = 'approve'): Promise<string> {
    const url = new URL(authorizeUrl)
    if (url.origin + url.pathname !== cloudEndpoint(this.base, CLOUD_AUTHORIZE_PATH)) throw new Error('not the authorize page')
    const ask = parseCloudAuthorizeRequest(Object.fromEntries(url.searchParams))
    const registered = ask ? this.links.redirectUriOf(ask.client_id) : null
    if (!ask || !registered || ask.redirect_uri !== registered) throw new Error('Cloud shows an error page; nothing goes back to hq')
    const back = new URL(ask.redirect_uri)
    back.searchParams.set('state', ask.state)
    if (answer === 'deny') {
      back.searchParams.set('error', 'access_denied')
      return back.toString()
    }
    const code = randomBytes(24).toString('base64url')
    this.codes.push({
      code, clientId: ask.client_id, redirectUri: ask.redirect_uri, challenge: ask.code_challenge, nonce: ask.nonce, subject,
      expiresAt: this.now() + 60_000, spent: false,
    })
    back.searchParams.set('code', code)
    return back.toString()
  }

  async exchange(form: Record<string, string>, clientId: string, accessToken: () => object): Promise<Response> {
    const ask = parseCloudAuthorizationCodeRequest(form)
    if (!ask) return error('invalid_request')
    const c = this.codes.find(x => x.code === ask.code)
    if (!c || c.spent || c.clientId !== clientId || c.redirectUri !== ask.redirect_uri || this.now() >= c.expiresAt) return error('invalid_grant')
    c.spent = true
    if ((await pkceChallengeOf(ask.code_verifier)) !== c.challenge) return error('invalid_grant')
    const iat = Math.floor(this.now() / 1000)
    const claims = { iss: cloudIssuer(this.base), sub: c.subject, aud: clientId, nonce: c.nonce, iat, exp: iat + 300, ...this.tamperNextIdToken }
    this.tamperNextIdToken = null
    const input = `${b64({ alg: 'EdDSA', typ: 'JWT' })}.${b64(claims)}`
    const idToken = `${input}.${b64(sign(null, Buffer.from(input), this.signingKey))}`
    return json(200, { ...accessToken(), id_token: idToken })
  }

  downtime(authorization: string | null, body: unknown): Response {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
    const clientId = token ? this.links.clientOfToken(token) : null
    if (!clientId) return error('invalid_token')
    let parsed: unknown = null
    try { parsed = JSON.parse(typeof body === 'string' ? body : '') } catch { /* not JSON: refused below */ }
    const notice = parseCloudDowntimeNotice(parsed)
    if (!notice) return error('invalid_request')
    this.notices.push({ ...notice, clientId })
    const accepted: CloudDowntimeAccepted = { accepted: true }
    return json(200, accepted)
  }

  /** As if the account had signed in to that client through Cloud, which is what links it to that hq. */
  linkAccount(clientId: string, subject: string): void {
    this.codes.push({ code: randomBytes(16).toString('base64url'), clientId, redirectUri: '', challenge: '', nonce: '', subject, expiresAt: 0, spent: true })
  }

  /** Answers only for an account that signed in to that client through Cloud: its link to that hq. */
  pledgeStatus(authorization: string | null, body: unknown): Response {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
    const clientId = token ? this.links.clientOfToken(token) : null
    if (!clientId) return error('invalid_token')
    let parsed: unknown = null
    try { parsed = JSON.parse(typeof body === 'string' ? body : '') } catch { /* not JSON: refused below */ }
    const ask = parseCloudPledgeStatusRequest(parsed)
    if (!ask) return error('invalid_request')
    if (!this.codes.some(c => c.clientId === clientId && c.subject === ask.subject && c.spent)) return error('not_found')
    const p = this.pledges.get(ask.subject)
    return json(200, {
      current_version: this.pledgeVersion,
      signature: p && p !== 'withdrawn' ? { version: p.version, signer_id: p.signerId } : null,
      withdrawn: p === 'withdrawn',
    })
  }
}
