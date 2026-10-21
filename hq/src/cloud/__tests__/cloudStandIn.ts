/**
 * A stand-in for Agenthix Cloud's side of the connection protocol (core/src/cloud/connection.ts), answering as a
 * `fetch`, so hq's client is tested against the protocol without a network. It is strict where Cloud must be: an
 * assertion is checked against the registered key and the endpoint it arrived at, a `jti` is accepted once, a
 * device code lapses and is spent by its approval, and polling too fast is answered `slow_down`. Each client has the
 * address it registered (core/src/cloud/hqAddress.ts), which only a request signed with its key replaces. Its errors
 * carry the status core names for them (core/src/cloud/answers.ts). Sign-in and the downtime email are its
 * `accounts` (cloudStandInAccounts.ts).
 *
 * It checks the protocol's version as Cloud's server does (core/src/cloud/version.ts): a call stating none, one it
 * cannot read, or one two majors or more from its own is refused with 426 before anything else is read, and every
 * answer states its own. `version` null is a Cloud from before the header, which neither checks nor states one.
 */
import {
  AUTHORIZATION_CODE_GRANT_TYPE, CLIENT_CREDENTIALS_GRANT_TYPE, CLOUD_CONNECT_ADDRESS_PATH, CLOUD_CONNECT_DEVICE_PATH, CLOUD_CONNECT_REVOKE_PATH,
  CLOUD_CONNECT_TOKEN_PATH, CLOUD_DOWNTIME_NOTICE_PATH, CLOUD_ERROR_STATUS, CLOUD_PLEDGE_STATUS_PATH, CLOUD_PROTOCOL_VERSION,
  CLOUD_PROTOCOL_VERSION_HEADER, CLOUD_UPGRADE_REQUIRED_STATUS, DEVICE_CODE_GRANT_TYPE, USER_CODE_ALPHABET, checkProtocolCompatibility, cloudEndpoint, cloudSignInRedirectUri, parseCloudAddressRequest, parseCloudBaseUrl, parseCloudClientAuthentication, parseCloudDeviceRequest,
  type CloudAddressRegistered, type CloudBearerErrorCode, type CloudConnectErrorCode, type CloudProtocolRefusal, type CloudRevoked, type CloudUrl,
} from '@agenthix/core'
import { cloudAssertionClientId, cloudClientIdOf, verifyCloudClientAssertion } from '@agenthix/core/cloud-crypto'
import { randomBytes } from 'node:crypto'
import { CloudAccountsStandIn } from './cloudStandInAccounts'

type Device = {
  deviceCode: string
  userCode: string
  publicKey: string
  clientId: string
  hqAddress: string
  organisationName: string
  expiresAt: number
  interval: number
  lastPollAt: number | null
  status: 'pending' | 'approved' | 'denied' | 'spent'
  organisation: { id: string; name: string } | null
}

type Client = { publicKey: string; organisation: { id: string; name: string }; hqAddress: string; revoked: boolean }

export type StandInRequest = { path: string; form: Record<string, string>; headers: Headers }

type StandInAnswer = { status: number; body: unknown; headers?: Record<string, string> }

const random = (bytes: number) => randomBytes(bytes).toString('base64url')

function userCode(): string {
  const pick = () => USER_CODE_ALPHABET[randomBytes(1)[0] % USER_CODE_ALPHABET.length]
  const four = () => Array.from({ length: 4 }, pick).join('')
  return `${four()}-${four()}`
}

export class CloudStandIn {
  readonly base: CloudUrl
  readonly requests: StandInRequest[] = []
  readonly devices: Device[] = []
  readonly clients = new Map<string, Client>()
  private readonly seenJti = new Set<string>()
  private tokenSerial = 0
  /** Access tokens issued, with the client each was issued to. */
  readonly issuedTokens = new Map<string, string>()
  readonly accounts: CloudAccountsStandIn
  /** What the next request (to `path`, when one is named) is answered with instead, once: a status, or a network failure. */
  private next: { answer: StandInAnswer | 'network'; path: string | null } | null = null
  /** The protocol version it speaks; null for a Cloud from before the header. */
  version: string | null

  constructor(
    private readonly now: () => number,
    readonly options: { expiresIn?: number; interval?: number; tokenLifetime?: number; base?: string; version?: string | null } = {},
  ) {
    this.version = options.version === undefined ? CLOUD_PROTOCOL_VERSION : options.version
    this.base = parseCloudBaseUrl(options.base ?? 'https://cloud.test')!
    this.accounts = new CloudAccountsStandIn(this.base, now, {
      redirectUriOf: id => { const c = this.clients.get(id); return c && !c.revoked ? cloudSignInRedirectUri(c.hqAddress) : null },
      clientOfToken: token => {
        const id = this.issuedTokens.get(token)
        const c = id ? this.clients.get(id) : undefined
        return id && c && !c.revoked ? id : null
      },
    })
  }

  /** The admin approves on Cloud's page, into an organisation of theirs. */
  approve(code: string, organisation = { id: 'org_42', name: 'Acme Robotics' }): void {
    const d = this.devices.find(x => x.userCode === code && x.status === 'pending')
    if (!d) throw new Error(`no pending device with ${code}`)
    d.status = 'approved'
    d.organisation = organisation
  }

  /** On a machine Cloud runs, Cloud registers hq's key and address itself, with no code approved (adr-0135). */
  registerForOrganisation(publicKey: string, clientId: string, hqAddress: string, organisation = { id: 'org_42', name: 'Acme Robotics' }): void {
    this.clients.set(clientId, { publicKey, organisation, hqAddress, revoked: false })
  }

  deny(code: string): void {
    const d = this.devices.find(x => x.userCode === code && x.status === 'pending')
    if (!d) throw new Error(`no pending device with ${code}`)
    d.status = 'denied'
  }

  /** Cloud ends the connection from its side. */
  revokeFromCloud(clientId: string): void {
    const c = this.clients.get(clientId)
    if (c) c.revoked = true
  }

  answerNextWith(answer: StandInAnswer | 'network', path: string | null = null): void {
    this.next = { answer, path }
  }

  readonly fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const res = await this.answer(input, init)
    if (this.version !== null && !res.headers.has(CLOUD_PROTOCOL_VERSION_HEADER)) res.headers.set(CLOUD_PROTOCOL_VERSION_HEADER, this.version)
    return res
  }

  private async answer(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    if (url.origin !== this.base.origin) throw new TypeError('fetch failed')
    const headers = new Headers(init?.headers)
    const contentType = headers.get('content-type') ?? ''
    const form = Object.fromEntries(new URLSearchParams(typeof init?.body === 'string' ? init.body : ''))
    this.requests.push({ path: url.pathname, form, headers })
    if (this.version !== null && !checkProtocolCompatibility(this.version, headers.get(CLOUD_PROTOCOL_VERSION_HEADER)).ok) {
      const refusal: CloudProtocolRefusal = { error: 'unsupported_protocol_version' }
      return json(CLOUD_UPGRADE_REQUIRED_STATUS, refusal)
    }
    const next = this.next && (this.next.path === null || this.next.path === url.pathname) ? this.next.answer : null
    if (next) this.next = null
    if (next === 'network') throw new TypeError('fetch failed')
    if (next) return json(next.status, next.body, next.headers)
    const isJsonNotice = (url.pathname === CLOUD_DOWNTIME_NOTICE_PATH || url.pathname === CLOUD_PLEDGE_STATUS_PATH) && contentType.startsWith('application/json')
    if (init?.method !== 'POST' || (!isJsonNotice && !contentType.startsWith('application/x-www-form-urlencoded'))) return error('invalid_request')
    switch (url.pathname) {
      case CLOUD_CONNECT_DEVICE_PATH: return this.device(form)
      case CLOUD_CONNECT_TOKEN_PATH: return this.token(form)
      case CLOUD_CONNECT_REVOKE_PATH: return this.revoke(form)
      case CLOUD_CONNECT_ADDRESS_PATH: return this.address(form)
      case CLOUD_DOWNTIME_NOTICE_PATH: return this.accounts.downtime(new Headers(init?.headers).get('authorization'), init?.body)
      case CLOUD_PLEDGE_STATUS_PATH: return this.accounts.pledgeStatus(new Headers(init?.headers).get('authorization'), init?.body)
      default: return error('not_found')
    }
  }

  private async device(form: Record<string, string>): Promise<Response> {
    const ask = parseCloudDeviceRequest(form)
    if (!ask) return error('invalid_request')
    const code = userCode()
    const d: Device = {
      deviceCode: random(32), userCode: code, publicKey: ask.public_key, clientId: await cloudClientIdOf(ask.public_key),
      hqAddress: ask.hq_address, organisationName: ask.organisation_name,
      expiresAt: this.now() + (this.options.expiresIn ?? 900) * 1000, interval: this.options.interval ?? 5,
      lastPollAt: null, status: 'pending', organisation: null,
    }
    this.devices.push(d)
    const page = cloudEndpoint(this.base, '/connect')
    return json(200, {
      device_code: d.deviceCode, user_code: code, verification_uri: page,
      verification_uri_complete: `${page}?user_code=${code}`, expires_in: this.options.expiresIn ?? 900, interval: d.interval,
    })
  }

  /** Checks the assertion against `publicKey` at `path`, and spends its `jti`; the refusal, or null when it passes. */
  private async authenticate(form: Record<string, string>, publicKey: string | null, path: string): Promise<Response | null> {
    const auth = parseCloudClientAuthentication(form)
    if (!auth || !publicKey) return error('invalid_client')
    const check = await verifyCloudClientAssertion(auth.client_assertion, publicKey, cloudEndpoint(this.base, path), this.now())
    if (!check.ok) return error('invalid_client')
    if (this.seenJti.has(check.claims.jti)) return error('invalid_client')
    this.seenJti.add(check.claims.jti)
    return null
  }

  private async token(form: Record<string, string>): Promise<Response> {
    if (form.grant_type === DEVICE_CODE_GRANT_TYPE) return this.poll(form)
    if (form.grant_type !== CLIENT_CREDENTIALS_GRANT_TYPE && form.grant_type !== AUTHORIZATION_CODE_GRANT_TYPE) return error('unsupported_grant_type')
    const clientId = cloudAssertionClientId(form.client_assertion ?? '')
    const client = clientId ? this.clients.get(clientId) : undefined
    const refused = await this.authenticate(form, client && !client.revoked ? client.publicKey : null, CLOUD_CONNECT_TOKEN_PATH)
    if (refused) return refused
    if (form.grant_type === AUTHORIZATION_CODE_GRANT_TYPE) return this.accounts.exchange(form, clientId!, () => this.accessToken(clientId!))
    return json(200, this.accessToken(clientId!))
  }

  private async poll(form: Record<string, string>): Promise<Response> {
    const d = this.devices.find(x => x.deviceCode === form.device_code)
    if (!d) return error('invalid_grant')
    const refused = await this.authenticate(form, d.publicKey, CLOUD_CONNECT_TOKEN_PATH)
    if (refused) return refused
    if (d.status === 'spent') return error('invalid_grant')
    if (this.now() >= d.expiresAt) return error('expired_token')
    if (d.status === 'denied') return error('access_denied')
    const tooSoon = d.lastPollAt !== null && this.now() - d.lastPollAt < d.interval * 1000
    d.lastPollAt = this.now()
    if (tooSoon) return error('slow_down')
    if (d.status === 'pending') return error('authorization_pending')
    d.status = 'spent'
    this.clients.set(d.clientId, { publicKey: d.publicKey, organisation: d.organisation!, hqAddress: d.hqAddress, revoked: false })
    return json(200, { ...this.accessToken(d.clientId), client_id: d.clientId, cloud_organisation: d.organisation })
  }

  /** Answers `revoked` for a key it no longer holds, or never did, as core says; a known key's assertion must verify. */
  private async revoke(form: Record<string, string>): Promise<Response> {
    const revoked: CloudRevoked = { revoked: true }
    if (!parseCloudClientAuthentication(form)) return error('invalid_client')
    const clientId = cloudAssertionClientId(form.client_assertion ?? '')
    const client = clientId ? this.clients.get(clientId) : undefined
    if (!client || client.revoked) return json(200, revoked)
    const refused = await this.authenticate(form, client.publicKey, CLOUD_CONNECT_REVOKE_PATH)
    if (refused) return refused
    client.revoked = true
    return json(200, revoked)
  }

  /** hq's new address, from a request signed with the client's key: from now on, sign-ins go back there and nowhere else. */
  private async address(form: Record<string, string>): Promise<Response> {
    const clientId = cloudAssertionClientId(form.client_assertion ?? '')
    const client = clientId ? this.clients.get(clientId) : undefined
    const refused = await this.authenticate(form, client && !client.revoked ? client.publicKey : null, CLOUD_CONNECT_ADDRESS_PATH)
    if (refused) return refused
    const ask = parseCloudAddressRequest(form)
    if (!ask) return error('invalid_request')
    client!.hqAddress = ask.hq_address
    const answer: CloudAddressRegistered = { hq_address: ask.hq_address }
    return json(200, answer)
  }

  private accessToken(clientId: string) {
    const token = `tok_${++this.tokenSerial}_${random(16)}`
    this.issuedTokens.set(token, clientId)
    return { access_token: token, token_type: 'Bearer', expires_in: this.options.tokenLifetime ?? 300 }
  }
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

/** A refusal, with the status core names for it. */
export function error(code: CloudConnectErrorCode | CloudBearerErrorCode): Response {
  return json(CLOUD_ERROR_STATUS[code], { error: code })
}
