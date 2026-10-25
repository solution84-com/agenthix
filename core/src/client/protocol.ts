/**
 * The client protocol: hq and the apps people use it from — the mobile app, and any later one, each naming itself in
 * `User-Agent` (`mobile/1.2.0`). hq's own web pages are not a client of it: hq serves them, so they always match.
 *
 * The app states its version on every request in `X-Client-Protocol-Version`, and in the socket.io handshake as
 * `auth.clientProtocolVersion`. hq states its own, and its release, before sign-in, in `GET /api/org/public-identity`
 * (`HqVersions`), so an app ahead of hq applies the same rule from its side. Under the rule every connection follows
 * (../protocol/compatibility.ts), majors at most one apart are served; two or more apart, or a version hq cannot
 * read, are refused with `ClientProtocolRefusal`: a 426 over HTTP, `ClientSocketRefusal` on the socket. A client
 * that states no version at all is served: a browser, or an app from before the client protocol.
 */
import { checkProtocolCompatibility, protocolRefusalMessage } from '../protocol/compatibility.js'

export const CLIENT_PROTOCOL_VERSION = '1.6'

export const CLIENT_PROTOCOL_VERSION_HEADER = 'X-Client-Protocol-Version'

/** The field of the socket.io handshake's `auth` the app states its version in. */
export const CLIENT_PROTOCOL_HANDSHAKE_FIELD = 'clientProtocolVersion'

/** The `message` of the error a socket.io client's `connect_error` receives when hq refuses its version. */
export const CLIENT_PROTOCOL_REFUSED = 'client_protocol_refused'

/** What hq states before sign-in, beside the organisation, in `GET /api/org/public-identity`. */
export type HqVersions = {
  /** hq's product version (`0.1.0-alpha.1`), or `dev` for a build made on a machine. */
  release: string
  clientProtocolVersion: string
  /** Whether HQ is set up yet, so an app says so before sign-in. Absent from an hq before 1.1. */
  claimState?: HqClaimState
}

/**
 * hq's claim state, worked out from its data and never stored:
 * - `unclaimed`: no account yet; only the link the installer printed opens setup;
 * - `setting_up`: the first account exists, and setup (its providers, then the organisation) is not finished: that
 *   account is the only one, and signs in to finish it;
 * - `set_up`: setup finished; HQ as everyone knows it.
 */
export const HQ_CLAIM_STATES = ['unclaimed', 'setting_up', 'set_up'] as const
export type HqClaimState = (typeof HQ_CLAIM_STATES)[number]

/** Which side must update: HQ, or the app. Always the one behind; the app, when its version cannot be read. */
export type ClientUpgradeSide = 'hq' | 'client'

/** The body of hq's 426, and the `data` of its socket refusal. */
export type ClientProtocolRefusal = {
  /** The refusal in words, naming both versions and the side to update. */
  error: string
  /** Majors two or more apart, or a version that is not `major.minor`. */
  reason: 'too_far_apart' | 'malformed'
  hqVersion: string
  /** The version the app stated, as it stated it when it could not be read. */
  clientVersion: string
  upgrade: ClientUpgradeSide
}

/** What a socket.io client's `connect_error` handler receives when hq refuses the app's version. */
export type ClientSocketRefusal = Error & { message: typeof CLIENT_PROTOCOL_REFUSED; data: ClientProtocolRefusal }

export type ClientProtocolDecision =
  /** Served. `clientVersion` is what the app stated, or null when it stated none. */
  | { ok: true; clientVersion: string | null }
  | { ok: false; refusal: ClientProtocolRefusal }

const NAMES = { own: 'HQ', peer: 'this app' }

/** hq's answer to the version a client stated. `own` is hq's, and is a parameter only so tests can move it. */
export function decideClientProtocol(presented: string | null | undefined, own: string = CLIENT_PROTOCOL_VERSION): ClientProtocolDecision {
  const c = checkProtocolCompatibility(own, presented)
  if (c.ok) return { ok: true, clientVersion: presented!.trim() }
  if (c.reason === 'absent') return { ok: true, clientVersion: null }
  const error = capitalise(protocolRefusalMessage(c, NAMES))
  const hqVersion = `${c.own.major}.${c.own.minor}`
  if (c.reason === 'malformed') {
    return { ok: false, refusal: { error, reason: 'malformed', hqVersion, clientVersion: c.presented, upgrade: 'client' } }
  }
  return {
    ok: false,
    refusal: {
      error, reason: 'too_far_apart', hqVersion, clientVersion: `${c.peer.major}.${c.peer.minor}`,
      upgrade: c.upgrade === 'own' ? 'hq' : 'client',
    },
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
