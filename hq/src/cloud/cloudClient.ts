/**
 * hq's calls to Agenthix Cloud for its connection (core/src/cloud/connection.ts): asking for a connection, polling it,
 * signing for an access token, telling Cloud hq's address, and revoking. Each request is form-encoded, as RFC 6749 has it, and each answer is
 * checked against the protocol before anything of it is used. Nothing here keeps anything but when Cloud last asked hq
 * to wait (`429`), before which nothing is sent to it, and a refusal of the protocol's version, while which nothing is
 * sent either; nothing is logged but that refusal, once.
 *
 * Every call states hq's protocol version and release (core/src/cloud/version.ts), and every answer's version is read
 * before anything else of it. Cloud two majors or more ahead, or refusing hq with 426 for the same, stops calls until hq
 * restarts, since only upgrading hq changes that; any other refusal of the version stops them until the next check-in.
 */
import {
  AUTHORIZATION_CODE_GRANT_TYPE, CLIENT_CREDENTIALS_GRANT_TYPE, CLOUD_CONNECT_ADDRESS_PATH, CLOUD_CONNECT_DEVICE_PATH, CLOUD_DOWNTIME_NOTICE_PATH,
  CLOUD_CONNECT_REVOKE_PATH, CLOUD_CONNECT_TOKEN_PATH, CLOUD_BUSY_STATUS, CLOUD_ERROR_STATUS, CLOUD_RETRY_AFTER_DEFAULT_S, CLOUD_RETRY_AFTER_MAX_S,
  CLOUD_PLEDGE_STATUS_PATH, CLOUD_CHECK_IN_INTERVAL_S, CLOUD_PROTOCOL_VERSION, CLOUD_PROTOCOL_VERSION_HEADER, CLOUD_UPGRADE_REQUIRED_STATUS,
  checkCloudAnswerProtocol, peerRefusalMessage, protocolRefusalMessage, parseCloudAddressRegistered, parseCloudDowntimeAccepted, parseCloudPledgeStatus, type CloudPledgeStatus,
  DEVICE_CODE_GRANT_TYPE, JWT_BEARER_ASSERTION_TYPE, cloudEndpoint, parseCloudAccessToken, parseCloudConnectError,
  parseCloudDeviceAuthorization, parseCloudIdTokenAnswer, readDevicePoll,
  type CloudAccessToken, type CloudDowntimeNotice, type CloudDeviceAuthorization, type CloudDevicePollOutcome, type CloudUrl,
} from '@agenthix/core'
import { cloudClientIdOf, signCloudClientAssertion, type CloudConnectionKeys } from '@agenthix/core/cloud-crypto'
import { BUILD_INFO } from '../server/buildInfo'

/** Cloud could not be reached, or answered in a way the protocol does not name. Its message is for a person. */
export class CloudCallError extends Error {}

/** Cloud answered "too many requests": nothing is asked of it before `retryAt`. */
export class CloudBusyError extends CloudCallError {
  constructor(readonly retryAt: number, now: number) {
    const minutes = Math.max(1, Math.ceil((retryAt - now) / 60_000))
    super(`Agenthix Cloud is busy — try again in ${minutes === 1 ? '1 minute' : `${minutes} minutes`}.`)
  }
}

/** Cloud does not speak a protocol version this hq does: the message says which side must upgrade. */
export class CloudProtocolError extends CloudCallError {}

export type CloudTokenOutcome = { kind: 'token'; token: CloudAccessToken } | { kind: 'revoked' }

/** A sign-in's code exchanged: the ID token, a code Cloud would not take (spent, lapsed, not this hq's), or the key revoked. */
export type CloudCodeOutcome = { kind: 'idToken'; idToken: string } | { kind: 'refused' } | { kind: 'revoked' }

export type CloudCodeExchange = { code: string; redirectUri: string; codeVerifier: string }

export type CloudClientApi = {
  readonly base: CloudUrl
  requestConnection(publicKey: string, hqAddress: string, organisationName: string): Promise<CloudDeviceAuthorization>
  poll(keys: CloudConnectionKeys, deviceCode: string): Promise<CloudDevicePollOutcome>
  token(keys: CloudConnectionKeys): Promise<CloudTokenOutcome>
  revoke(keys: CloudConnectionKeys): Promise<void>
  /** `revoked` when Cloud no longer holds the key. */
  registerAddress(keys: CloudConnectionKeys, hqAddress: string): Promise<'registered' | 'revoked'>
  exchangeCode(keys: CloudConnectionKeys, exchange: CloudCodeExchange): Promise<CloudCodeOutcome>
  /** `unauthorized` when the token was not taken, so the caller signs for a fresh one. */
  sendDowntimeNotice(accessToken: string, notice: CloudDowntimeNotice): Promise<'sent' | 'unauthorized'>
  /** `notLinked` when Cloud knows no link from this hq to that account. */
  pledgeStatus(accessToken: string, subject: string): Promise<CloudPledgeStatus | 'notLinked' | 'unauthorized'>
  /** Why calls are being refused for the protocol's version, naming the side to upgrade; null when they are not. */
  protocolProblem(): string | null
}

const TIMEOUT_MS = 15_000
const UNREACHABLE = 'Agenthix Cloud could not be reached. Try again in a moment.'
const NOT_UNDERSTOOD = 'Agenthix Cloud answered in a way this HQ does not understand.'
const DEFAULT_WAIT_MS = CLOUD_RETRY_AFTER_DEFAULT_S * 1000
const LONGEST_WAIT_MS = CLOUD_RETRY_AFTER_MAX_S * 1000
const PROTOCOL_RETRY_MS = CLOUD_CHECK_IN_INTERVAL_S * 1000
const NAMES = { own: 'this HQ', peer: 'Agenthix Cloud' }

/** Why an answer's protocol version stops hq calling, and whether only upgrading hq can change it; null when it does not. */
function protocolRefusal(status: number, stated: string | null): { message: string; hqMustUpgrade: boolean } | null {
  const c = checkCloudAnswerProtocol(stated)
  const hqMustUpgrade = !c.ok && c.reason === 'too_far_apart' && c.upgrade === 'own'
  if (status === CLOUD_UPGRADE_REQUIRED_STATUS) return { message: peerRefusalMessage(CLOUD_PROTOCOL_VERSION, stated, NAMES), hqMustUpgrade }
  return !c.ok && c.reason === 'too_far_apart' ? { message: protocolRefusalMessage(c, NAMES), hqMustUpgrade } : null
}

/** `Retry-After` as seconds or an HTTP date (RFC 9110 §10.2.3), in milliseconds from `now`. */
export function retryAfterMs(value: string | null, now: number): number {
  const v = value?.trim() ?? ''
  const at = /^\d+$/.test(v) ? now + Number(v) * 1000 : Date.parse(v)
  if (Number.isNaN(at)) return DEFAULT_WAIT_MS
  return Math.min(Math.max(at - now, 0), LONGEST_WAIT_MS)
}

export function cloudClient(
  base: CloudUrl, fetchImpl: typeof fetch = fetch, now: () => number = Date.now, onProtocolRefused: (message: string) => void = () => undefined,
): CloudClientApi {
  let busyUntil = 0
  let refused: { error: CloudProtocolError; until: number } | null = null

  async function post(path: string, form: Record<string, string>): Promise<{ status: number; body: unknown }> {
    return send(path, { 'content-type': 'application/x-www-form-urlencoded' }, new URLSearchParams(form).toString())
  }

  async function send(path: string, headers: Record<string, string>, payload: string): Promise<{ status: number; body: unknown }> {
    if (refused && now() < refused.until) throw refused.error
    if (now() < busyUntil) throw new CloudBusyError(busyUntil, now())
    let res: Response
    try {
      res = await fetchImpl(cloudEndpoint(base, path), {
        method: 'POST',
        headers: {
          ...headers, accept: 'application/json', [CLOUD_PROTOCOL_VERSION_HEADER]: CLOUD_PROTOCOL_VERSION, 'user-agent': `hq/${BUILD_INFO.version}`,
        },
        body: payload,
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new CloudCallError(UNREACHABLE)
    }
    const refusal = protocolRefusal(res.status, res.headers.get(CLOUD_PROTOCOL_VERSION_HEADER))
    if (refusal) {
      refused = { error: new CloudProtocolError(refusal.message), until: refusal.hqMustUpgrade ? Infinity : now() + PROTOCOL_RETRY_MS }
      onProtocolRefused(refusal.message)
      throw refused.error
    }
    if (res.status === CLOUD_BUSY_STATUS) {
      busyUntil = now() + retryAfterMs(res.headers.get('retry-after'), now())
      throw new CloudBusyError(busyUntil, now())
    }
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // Not JSON: each caller reads null as an answer it does not understand.
    }
    return { status: res.status, body }
  }

  const authentication = async (keys: CloudConnectionKeys, path: string) => ({
    client_assertion_type: JWT_BEARER_ASSERTION_TYPE,
    client_assertion: await signCloudClientAssertion(keys, cloudEndpoint(base, path), now()),
  })

  return {
    base,

    protocolProblem: () => (refused && now() < refused.until ? refused.error.message : null),

    async requestConnection(publicKey, hqAddress, organisationName) {
      const { status, body } = await post(CLOUD_CONNECT_DEVICE_PATH, { public_key: publicKey, hq_address: hqAddress, organisation_name: organisationName })
      const answer = status === 200 ? parseCloudDeviceAuthorization(body, base) : null
      if (!answer) throw new CloudCallError(NOT_UNDERSTOOD)
      return answer
    },

    async poll(keys, deviceCode) {
      const { status, body } = await post(CLOUD_CONNECT_TOKEN_PATH, {
        grant_type: DEVICE_CODE_GRANT_TYPE, device_code: deviceCode, ...(await authentication(keys, CLOUD_CONNECT_TOKEN_PATH)),
      })
      const outcome = readDevicePoll(status, body, await cloudClientIdOf(keys.publicKey))
      if (!outcome) throw new CloudCallError(NOT_UNDERSTOOD)
      return outcome
    },

    async token(keys) {
      const { status, body } = await post(CLOUD_CONNECT_TOKEN_PATH, {
        grant_type: CLIENT_CREDENTIALS_GRANT_TYPE, ...(await authentication(keys, CLOUD_CONNECT_TOKEN_PATH)),
      })
      if (status === 200) {
        const token = parseCloudAccessToken(body)
        if (token) return { kind: 'token', token }
      } else if (parseCloudConnectError(body)?.error === 'invalid_client') {
        return { kind: 'revoked' }
      }
      throw new CloudCallError(NOT_UNDERSTOOD)
    },

    async revoke(keys) {
      const { status } = await post(CLOUD_CONNECT_REVOKE_PATH, await authentication(keys, CLOUD_CONNECT_REVOKE_PATH))
      if (status !== 200) throw new CloudCallError(NOT_UNDERSTOOD)
    },

    async registerAddress(keys, hqAddress) {
      const { status, body } = await post(CLOUD_CONNECT_ADDRESS_PATH, { hq_address: hqAddress, ...(await authentication(keys, CLOUD_CONNECT_ADDRESS_PATH)) })
      if (status === 200 && parseCloudAddressRegistered(body)?.hq_address === hqAddress) return 'registered'
      if (status === CLOUD_ERROR_STATUS.invalid_client && parseCloudConnectError(body)?.error === 'invalid_client') return 'revoked'
      throw new CloudCallError(NOT_UNDERSTOOD)
    },

    async exchangeCode(keys, { code, redirectUri, codeVerifier }) {
      const { status, body } = await post(CLOUD_CONNECT_TOKEN_PATH, {
        grant_type: AUTHORIZATION_CODE_GRANT_TYPE, code, redirect_uri: redirectUri, code_verifier: codeVerifier,
        ...(await authentication(keys, CLOUD_CONNECT_TOKEN_PATH)),
      })
      if (status === 200) {
        const answer = parseCloudIdTokenAnswer(body)
        if (answer) return { kind: 'idToken', idToken: answer.id_token }
      } else {
        const error = parseCloudConnectError(body)?.error
        if (error === 'invalid_client') return { kind: 'revoked' }
        if (error === 'invalid_grant' || error === 'access_denied') return { kind: 'refused' }
      }
      throw new CloudCallError(NOT_UNDERSTOOD)
    },

    async sendDowntimeNotice(accessToken, notice) {
      const { status, body } = await send(CLOUD_DOWNTIME_NOTICE_PATH, { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` }, JSON.stringify(notice))
      if (status === CLOUD_ERROR_STATUS.invalid_token) return 'unauthorized'
      if (status !== 200 || !parseCloudDowntimeAccepted(body)) throw new CloudCallError(NOT_UNDERSTOOD)
      return 'sent'
    },

    async pledgeStatus(accessToken, subject) {
      const { status, body } = await send(CLOUD_PLEDGE_STATUS_PATH, { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` }, JSON.stringify({ subject }))
      if (status === CLOUD_ERROR_STATUS.invalid_token) return 'unauthorized'
      if (status === CLOUD_ERROR_STATUS.not_found) return 'notLinked'
      const answer = status === 200 ? parseCloudPledgeStatus(body) : null
      if (!answer) throw new CloudCallError(NOT_UNDERSTOOD)
      return answer
    },
  }
}
