/**
 * The crossings to Agenthix Cloud (host-management spec §4 C6, §7), as types only. Each feature that uses them is
 * governed by its own condition (this machine enrolled with Cloud, this hq connected, the person's account linked),
 * checked by the server that runs it, not by this module.
 *
 * What is here is the contract Cloud's server implements and the host service and the Fleet Console are built
 * against. It is first-party: published with the code, but no server or client other than these is supported on it.
 *
 * A type marked `@experimental` (TSDoc) is not yet part of any protocol: it sketches the Fleet Console's own calls to
 * Cloud's API, which nothing makes yet, so it can change freely and a snapshot of the protocols leaves it out.
 */
import type { HostEnvelope, HostIdentity } from './envelope.js'
import type { RelayFrame } from './relay.js'
import type { CloudJoinAcceptance, CloudJoinRequest } from './join.js'
import type { HostFigures } from './figures.js'
import type { HostRefusal } from './operations.js'
import type { CloudRequest, CloudResults } from './cloudOperations.js'

/**
 * C6: the signed-in fleet admin's own Cloud token, short-lived and used for one action. Never kept: the Fleet Console
 * remembers only which Cloud account is linked (`LinkedCloudAccount`), and nobody signs in to it with Cloud.
 *
 * @experimental
 */
export type CloudActionToken = {
  accessToken: string
  expiresAt: string
}

/** @experimental */
export type LinkedCloudAccount = {
  /** Cloud's identifier for the person's account; the only thing remembered. */
  accountId: string
  linkedAt: string
}

/**
 * The organisation's connection to Cloud, held by hq (the connection protocol, core/src/cloud) and made or ended only
 * from the Fleet Console's own machine.
 */
export type CloudOrganisationConnection = {
  cloudOrganisationId: string
  /** The organisation's name as Cloud knows it: "Connected as Acme Robotics". */
  name: string
  connectedAt: string
}

/**
 * One of Cloud's machines as the Fleet Console shows it, read through Cloud's API: figures, never data.
 *
 * @experimental
 */
export type CloudSiteSummary = {
  siteName: string
  machineName: string
  hostsHq: boolean
  /** Where Cloud runs it, in words ("Helsinki"). */
  region: string | null
  /** Cloud's own word for its state; the Fleet Console shows it as given. */
  healthy: boolean
  problem: string | null
  agents: { running: number; maxAtOnce: number } | null
  figures: HostFigures | null
}

/**
 * A fleet admin on Cloud, as the Fleet Console lists them for a connected organisation. A suggestion only: hq stays
 * the authority over its own role, and nobody becomes a fleet admin in hq by being on this list (spec §1).
 *
 * @experimental
 */
export type CloudFleetAdminListing = {
  cloudAccountId: string
  name: string
  email: string | null
  /** Whether an hq account with the same address already holds the role, as the Fleet Console worked it out. */
  fleetAdminInHq: boolean
}

/** Remote access to the Fleet Console through Cloud's relay (spec §7). */
export const REMOTE_ACCESS_DEFAULT_MS = 2 * 60 * 60_000
export const REMOTE_ACCESS_MAX_MS = 8 * 60 * 60_000

/** The authenticator code's recovery codes, made once when the code is set up (spec §7). */
export const AUTHENTICATOR_RECOVERY_CODE_COUNT = 10

/**
 * Where a request to turn remote access on or off came from. `tunnel` is a session that arrived through the remote
 * tunnel; `cloud` is Cloud itself.
 */
export type RemoteAccessOrigin = RemoteAccessTurnedOnBy['via'] | 'tunnel' | 'cloud'

/**
 * Whether a request may turn remote access on, or extend it: only from the Fleet Console's own machine. A session
 * through the tunnel can never, so it cannot keep itself open, and Cloud can never (spec §7). Turning it off is
 * anyone's, from anywhere, and needs no check. The one exception is a machine Cloud runs, where Cloud's controller
 * turns on direct remote access by its own operations (cloudRemoteAccess.ts, ADR-0132), never through this rule.
 */
export function mayTurnOnRemoteAccess(origin: RemoteAccessOrigin): boolean {
  return origin === 'localScreen' || origin === 'cli'
}

export type RemoteAccessDuration = { ok: true; ms: number } | { ok: false; message: string }

/** `--for` as a person types it: `90m`, `2h`, `1h30m`. Nothing given is 2 hours; more than 8 hours is refused. */
export function parseRemoteAccessDuration(text: string | undefined): RemoteAccessDuration {
  if (text === undefined) return { ok: true, ms: REMOTE_ACCESS_DEFAULT_MS }
  const m = /^(?:(\d{1,2})h)?(?:(\d{1,3})m)?$/i.exec(text.trim())
  const ms = m && (m[1] || m[2]) ? (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60_000 : 0
  if (ms <= 0) return { ok: false, message: `"${text}" is not a length of time: write it like 90m, 2h or 1h30m.` }
  if (ms > REMOTE_ACCESS_MAX_MS) return { ok: false, message: 'Remote access runs for 8 hours at most.' }
  return { ok: true, ms }
}

/**
 * Who turned it on. Only the Fleet Console's own machine can (its local listener, or the CLI); a session that came
 * through the tunnel, and Cloud, never can — so there is no remote variant to express.
 */
export type RemoteAccessTurnedOnBy = { via: 'localScreen'; userId: string } | { via: 'cli' }

export type RemoteAccessState =
  | { on: false }
  | {
      on: true
      turnedOnBy: RemoteAccessTurnedOnBy
      startedAt: string
      /** It switches itself off then; it cannot be extended from a remote session. */
      endsAt: string
      /** The address under Cloud's domain the fleet admin opens. */
      address: string
    }

/**
 * The relay connection the Fleet Console dials out to while remote access is on. Cloud forwards bytes it cannot read.
 *
 * @experimental
 */
export type RemoteRelayHello = {
  cloudOrganisationId: string
  /** The Fleet Console's own certificate's fingerprint, where encryption ends. */
  certificateFingerprint: string
  endsAt: string
}

/**
 * The Cloud controller on a host service: the same envelope and operations as the Fleet Console, under its own identity,
 * pinned when the machine enrolled (join.ts) and kept in the host service's state at `0600`.
 */
export type CloudControllerBinding = {
  identity: HostIdentity & { role: 'cloud' }
  /** What Cloud knows the machine by; the machine reconnects with it (`HOST_ID_HEADER`). */
  machineId: string
  pinnedAt: string
}

export type CloudOperation = CloudRequest['op']

export type CloudResult<O extends CloudOperation = CloudOperation> =
  | { ok: true; op: O; result: CloudResults[O] }
  | { ok: false; op: O | null; refusal: HostRefusal }

/**
 * What is sealed between the Cloud controller and a machine enrolled with it, besides what a Fleet Console's envelopes
 * carry (`HostMessage`). A request is recorded as Cloud's whatever it claims. `hello` is a first envelope on a
 * reconnect that asks nothing.
 */
export type CloudControllerMessage =
  | { kind: 'request'; requestId: string; by: { kind: 'cloud' }; request: CloudRequest }
  | { kind: 'result'; replyTo: string; result: CloudResult }
  | { kind: 'hello' }

/**
 * Where a session reached the Fleet Console: on its own machine (its listener, in a browser there or through an SSH
 * tunnel) or through remote access. Only the second needs the authenticator code, and it can never turn remote
 * access on, nor set up the code, nor connect the organisation to Cloud.
 */
export type SessionPlace = 'onTheMachine' | 'throughRemoteAccess'

/** `GET /api/cloud`: the organisation's connection to Cloud, and the signed-in person's own linked Cloud account. */
export type CloudView = {
  organisation: CloudOrganisationConnection | null
  /**
   * Always null until the Fleet Console's own Cloud sign-in is built.
   *
   * @experimental
   */
  account: LinkedCloudAccount | null
  place: SessionPlace
  /** A connection asked for and waiting on an admin's approval on Cloud. */
  connecting: CloudConnecting | null
  /** How the last request ended, while nothing is connected or waiting. */
  lastAttempt: CloudConnectEnded | null
  /** Cloud's origin, for the links out to it; null when `CLOUD_URL` is not a usable address. */
  cloudUrl: string | null
  /** hq runs on a machine Agenthix Cloud runs (`HqCloudState.runByCloud`). */
  runByCloud: boolean
  /** Why hq's calls to Cloud are refused for the protocol's version, naming the side to upgrade; null when they are not. */
  problem?: string | null
}

/** `GET /api/remote-access`. */
export type RemoteAccessView = {
  state: RemoteAccessState
  /** The relay is Cloud's, so it cannot be turned on until the organisation is connected. */
  organisationConnected: boolean
  place: SessionPlace
}

/** `GET /api/authenticator`: the signed-in person's own code. */
export type AuthenticatorView = {
  code: { setUpAt: string; recoveryCodesLeft: number } | null
  place: SessionPlace
}

/** The six digits an authenticator app shows, or one of the recovery codes (`xxxx-xxxx`). */
export const AUTHENTICATOR_CODE = /^\d{6}$/
export const RECOVERY_CODE = /^[a-z0-9]{4}-[a-z0-9]{4}$/

/**
 * Frames on Cloud's host link, the same host protocol. Enrolment: the machine sends `host.join`, and
 * Cloud answers `host.joined` with the machine id it knows the machine by, or `host.joinRefused`. Reconnected, the
 * first frame is Cloud's: an envelope, never seen before, from the identity the machine pinned.
 */
export type CloudHostLinkFrame =
  | RelayFrame<'ping' | 'pong', Record<string, never>>
  | RelayFrame<'relay.envelope', { envelope: HostEnvelope }>
  | RelayFrame<'host.join', CloudJoinRequest>
  | RelayFrame<'host.joined', { machineId: string; acceptance: CloudJoinAcceptance }>
  | RelayFrame<'host.joinRefused', { reason: 'refused' | 'expired' | 'used' }>

/**
 * A connection hq asked Cloud for, waiting on approval: the user code the admin checks against the one on Cloud's page,
 * and that page. The device code it polls with stays in hq.
 */
export type CloudConnecting = {
  userCode: string
  verificationUri: string
  /** The page with the code filled in, which the Fleet Console links to. */
  verificationUriComplete: string
  expiresAt: string
}

/** Why the last request ended without a connection: refused on Cloud, not approved in time, or Cloud stopped answering. */
export type CloudConnectEnded = 'refused' | 'expired' | 'failed'

/** `cloud.state` on the console link: hq's side of its connection to Cloud. */
export type HqCloudState = {
  connection: CloudOrganisationConnection | null
  connecting: CloudConnecting | null
  lastAttempt: CloudConnectEnded | null
  /** hq runs on a machine Agenthix Cloud runs, which its host service tells it. */
  runByCloud: boolean
  /** Why hq's calls to Cloud are refused for the protocol's version, naming the side to upgrade; null when they are not. */
  problem?: string | null
}
