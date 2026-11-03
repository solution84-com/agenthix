/**
 * The two connections hq holds for host management, beside — not inside — the site channel (`/hq-link`):
 *
 * - the **host link** (C3): each host service dials it with its machine credential, or with a join lookup while it
 *   connects for the first time;
 * - the **console link** (C8): the console site dials it with the pairing secret or the credential from a one-time
 *   code.
 *
 * hq passes envelopes between them by fingerprint and reads none. On the console link it also answers the Fleet
 * Console's own requests — signing in, registering a site's credential, the activity record — which are hq's business
 * and are not sealed. Versioned on their own as the host protocol, by the compatibility rule
 * (`checkProtocolCompatibility`).
 */
import type { HostEnvelope, HostIdentity } from './envelope.js'
import type {
  JoinAcceptance, JoinPurpose, JoinRequest, ConsoleHandoverAcceptance, ConsoleHandoverAsk, ConsoleHandoverCertificate,
} from './join.js'
import type { TransferChunk, TransferClosedReason } from './transfer.js'
import type { HqAbout, HqRelay, SiteLoad } from './hqFacts.js'
import type { FleetActivityPage, FleetNotice, HqAccount } from './fleetRecord.js'
import type { CloudConnecting, HqCloudState } from './cloud.js'
import type { SiteLivePreviewsView } from './livePreviews.js'
import type { LivePreviewLimit } from '../livePreview/livePreview.js'

/** The host protocol: both links' version, and that of Cloud's host link. */
export const HOST_PROTOCOL_VERSION = '1.3'

export const HQ_HOST_LINK_PATH = '/host-link'
export const HQ_CONSOLE_LINK_PATH = '/console-link'

/** Sent by a host service that has no machine credential yet, instead of one: the lookup derived from its code. */
export const HOST_JOIN_LOOKUP_HEADER = 'X-Host-Join'

/**
 * On Cloud's `/host-link` (cloud.ts' `CloudHostLinkFrame`), which a machine enrolled with Cloud dials at `CLOUD_URL`:
 * the machine id it reconnects with. No bearer secret goes with it; the connection does nothing until Cloud's first
 * frame, a fresh envelope signed by the Cloud identity the machine pinned.
 */
export const HOST_ID_HEADER = 'X-Host-Id'

export const MACHINE_RELAY_CREDENTIAL_PREFIX = 'hmc'

/**
 * A host service that disconnected itself tells hq it left (spec §6), with its machine credential as
 * `Authorization: Bearer <value>`. The only effect: hq lists the machine as having left by itself, and refuses its
 * link from then on. Its site, if it carries one, leaves with its own credential at `SITE_LEAVE_PATH`.
 */
export const HOST_LEAVE_PATH = '/api/v1/hosts/leave'

/**
 * A site restored from its backup onto a machine that joined to take its place (adr-0119) renews its credential here,
 * once, before it starts. Its host service presents the site's credential from the backup as
 * `Authorization: Bearer <value>`, and its own machine credential in `SITE_RESTORE_MACHINE_HEADER`; the body is
 * `SiteRestoreRenewal`. hq accepts only while no machine is connected as the site, and only for the machine a fleet
 * admin confirmed with a code for restoring that site; from then on the old credential is refused.
 */
export const SITE_RESTORE_RENEW_PATH = '/api/v1/sites/restore-renew'
export const SITE_RESTORE_MACHINE_HEADER = 'X-Machine-Credential'

/** The hash of the site's new credential, made on the machine: the credential itself never leaves it. */
export type SiteRestoreRenewal = { credentialHash: string }

/** hq's answer: the site it renewed. A refusal is `{ error: <words> }` with 401 or 409. */
export type SiteRestoreRenewed = { executionSiteId: string; siteName: string }

/**
 * The console link's caller presents, as `Authorization: Bearer <value>`, either the pairing secret (on hq's machine)
 * or its lasting console credential. A Fleet Console installed elsewhere presents, once, in this header instead, the
 * lookup derived from its one-time code (`consoleCodeLookup`) — never the code, which hq must not learn when the code
 * came from the running Fleet Console. For a code hq made itself (no Fleet Console running), hq answers with
 * `console.credential` as the link's first frame. For a handover code, the connection waits while the running Fleet
 * Console checks the new one (`console.handoverAsk`, join.ts), and gets its credential once the move is done.
 * Either way, the credential before it is retired, and the pairing secret with it — for a handover only once the new
 * one acknowledged its credential. The code's first character says which kind it is (`consoleCodeKind`), so a new
 * Fleet Console holding a handover code refuses a credential that comes without the machines.
 */
export const HQ_CONSOLE_CODE_HEADER = 'X-Console-Code'
export const CONSOLE_CREDENTIAL_PREFIX = 'fcc'
/** How long `console-code` on hq's machine keeps its code: one hour, as a join code. */
export const CONSOLE_CODE_TTL_MS = 60 * 60_000

/** Either link's version, sent when it dials; a peer the compatibility rule (`checkProtocolCompatibility`) refuses is answered 426. */
export const HOST_PROTOCOL_VERSION_HEADER = 'X-Host-Protocol-Version'

/**
 * The largest frame hq relays: an envelope at its largest body (`HOST_ENVELOPE_MAX_BODY_BYTES`, base64url) with its
 * header. A larger one is answered with `relay.undeliverable` and `too_large`, and one over four times this closes the link.
 */
export const HOST_RELAY_MAX_FRAME_BYTES = 1_500_000

export type RelayUndeliverableReason = 'recipient_offline' | 'unknown_recipient' | 'too_large' | 'not_allowed' | 'malformed'

/** One frame on either link. Requests and answers pair as on the site channel (ADR-0045). */
export type RelayFrame<T extends string = string, P = unknown> = {
  version: string
  type: T
  payload: P
  requestId?: string
  replyTo?: string
}

/** Frames on the host link. */
export type HostLinkFrame =
  | RelayFrame<'ping' | 'pong', Record<string, never>>
  /** Either way: an envelope to or from the Fleet Console (or the Cloud controller). */
  | RelayFrame<'relay.envelope', { envelope: HostEnvelope }>
  | RelayFrame<'relay.undeliverable', { envelopeId: string; reason: RelayUndeliverableReason }>
  /** host → hq on a join connection: its half of the join. */
  | RelayFrame<'host.join', JoinRequest>
  /** hq → host: the fleet admin confirmed; the machine credential exists only in this frame. */
  | RelayFrame<'host.joined', { hostId: string; machineCredential: string; acceptance: JoinAcceptance }>
  | RelayFrame<'host.joinRefused', { reason: 'refused' | 'expired' | 'used' }>
  /** hq → host: the machine was disconnected in the Fleet Console; its credential is gone. */
  | RelayFrame<'revoke', Record<string, never>>
  /**
   * hq → host, as it connects and when the Fleet Console moves: every handover certificate hq holds, oldest first. The
   * machine follows only one signed by the Fleet Console it pins (join.ts).
   */
  | RelayFrame<'console.handover', { certificates: ConsoleHandoverCertificate[] }>
  /** hq → host, before hq stops to move: the address it moves to (`HqAddressFrame`). */
  | RelayFrame<'hq.address', HqAddressFrame>
  /** hq → host, as each connection of the link opens (since 1.3): the address hq sees it from (`HqSeenFromFrame`). */
  | RelayFrame<'hq.seenFrom', HqSeenFromFrame>
  /**
   * Host → hq → host, only between the two machines of a transfer the Fleet Console opened (transfer.ts): a signed
   * chunk of the sealed backup, the receiver's acknowledgement of one, and the steps around it, sealed between the
   * two. hq passes each unchanged to the other machine of the transfer, and nowhere else.
   */
  | RelayFrame<'transfer.chunk', TransferChunk>
  | RelayFrame<'transfer.ack', { transferId: string; seq: number }>
  | RelayFrame<'transfer.envelope', { transferId: string; envelope: HostEnvelope }>
  /** hq → host: hq dropped the transfer, and passes nothing more of it. */
  | RelayFrame<'transfer.closed', { transferId: string; reason: TransferClosedReason }>

/**
 * hq tells each connected host service and the Fleet Console the address it moves to (host-management spec §13), as it
 * tells its sites. Each keeps its address and switches once the new one passes the move check (moveCheck.ts); told
 * the address it already uses, it stops waiting. One on hq's own machine, which reaches hq on its local listener,
 * takes no notice.
 */
export type HqAddressFrame = { address: string }

/**
 * The address hq sees a host link's connection from: the connection's own remote address, or, behind hq's trusted
 * proxies, the one they say it came from. On a machine behind a router that is the router's public address, whose
 * forwarded ports lead back into the organisation's network, so the host service keeps live previews from reaching it
 * (`public-address`). An address that is not public (hq on the same network, a tailnet, a VPN) tells the machine
 * nothing, and it asks a STUN server instead.
 */
export type HqSeenFromFrame = { address: string }

/** A host service as the Fleet Console sees it through hq. */
export type RelayedHost = {
  hostId: string
  fingerprint: string
  machineName: string
  online: boolean
  since: string
  /** Set when the machine disconnected itself and told hq so (spec §6): it stays listed until a fleet admin removes it. */
  leftAt?: string
}

/**
 * An hq account that holds the fleet admin role, as the Fleet Console lists it. `since` is when it was given the role;
 * null from an hq older than the field.
 */
export type FleetAdminAccount = { id: string; name: string; username: string; organisationAdmin: boolean; since: string | null }

/**
 * The console's requests to hq, each with what hq answers. Closed like the host service's operations: hq answers
 * anything else with `unknown_method`.
 */
export type ConsoleLinkMethods = {
  /** A person's hq sign-in; hq answers whether it holds the fleet admin role. The password is not kept. */
  'signIn.check': {
    params: { username: string; password: string }
    result: { ok: true; user: { id: string; name: string; fleetAdmin: boolean } } | { ok: false }
  }
  'join.open': { params: { lookup: string; expiresAt: string; purpose: JoinPurpose }; result: { joinId: string } }
  'join.close': { params: { joinId: string }; result: { closed: boolean } }
  /** After the fleet admin confirmed the fingerprint: hq makes the machine credential and hands it to the machine. */
  'join.accept': { params: { joinId: string; acceptance: JoinAcceptance }; result: { hostId: string } }
  'join.refuse': { params: { joinId: string }; result: { refused: boolean } }
  'host.list': { params: Record<string, never>; result: { hosts: RelayedHost[] } }
  /** Removes the machine's credential to the relay; hq closes its link with `revoke`. */
  'host.disconnect': { params: { hostId: string }; result: { disconnected: boolean } }
  /**
   * A site's credential, as the host service made it, registered so the site takes part (spec §6 step 5, §9). Only its
   * hash crosses: the credential stays on the machine. hq names the site after the machine it carries it on.
   */
  'site.register': {
    params: { hostId: string; credentialHash: string }
    result: { executionSiteId: string }
  }
  'site.remove': { params: { executionSiteId: string }; result: { removed: boolean } }
  /** `byUserId` must hold the role. `granted` is false when `userId` already held it. Announced. */
  'fleetAdmin.grant': { params: { userId: string; byUserId: string }; result: { granted: boolean } }
  /** As `fleetAdmin.grant`. Refused (`not_allowed`) when it would leave no fleet admin. Announced. */
  'fleetAdmin.revoke': { params: { userId: string; byUserId: string }; result: { revoked: boolean } }
  /** Every account holding the role; `username` is what they sign in with, `organisationAdmin` whether they hold that too. */
  'fleetAdmin.list': { params: Record<string, never>; result: { admins: FleetAdminAccount[] } }
  /**
   * What a fleet admin did, kept in hq; `announce` tells every fleet admin and organisation admin (spec §4).
   * `byUserId` is null when the machine did it (hq's machine joining its own Fleet Console at install); only this
   * method accepts a null actor.
   */
  'activity.record': {
    params: { byUserId: string | null; action: string; subject: string; at: string; announce: boolean }
    result: { recorded: boolean }
  }
  /**
   * Moving the Fleet Console (join.ts): the running one opens a handover with the lookup of its code, for an hour at
   * most; a new one withdraws any earlier one still open.
   */
  'handover.open': { params: { lookup: string; expiresAt: string }; result: { handoverId: string } }
  /** The running Fleet Console checked the new one's binding: hq passes its answer to the new one. */
  'handover.accept': { params: { handoverId: string; acceptance: ConsoleHandoverAcceptance }; result: { passed: boolean } }
  'handover.close': { params: { handoverId: string }; result: { closed: boolean } }
  /**
   * A site's move (transfer.ts): lets the two machines pass one transfer between them, from `fromHostId` to
   * `toHostId`, until `expiresAt` at most. Opening the same transfer again, before it started, moves its expiry.
   */
  'transfer.open': {
    params: { transferId: string; fromHostId: string; toHostId: string; expiresAt: string }
    result: { opened: boolean }
  }
  'transfer.close': { params: { transferId: string }; result: { closed: boolean } }
  /** The site answers from the new machine now: hq records the machine it runs on. Its credential is unchanged. */
  'site.move': { params: { executionSiteId: string; toHostId: string }; result: { moved: boolean } }
  /**
   * For the Fleet Console's screens (hqFacts.ts): the organisation's name and the address people open HQ at — hq's
   * configured address, not the one the Fleet Console dials. An hq older than 1.3 answers `unknown_method`.
   */
  'hq.about': { params: Record<string, never>; result: HqAbout }
  /** Each connected site's runs, from the health it last reported; a site that has reported none is left out. */
  'site.loads': { params: Record<string, never>; result: { sites: SiteLoad[] } }
  /**
   * hq's own relay, for the card on HQ's page (hqFacts.ts): its files address, whether it is answering, the sites it
   * serves and its traffic. `relay` is null when hq has none. An hq older than this answers `unknown_method`.
   */
  'relay.facts': { params: Record<string, never>; result: { relay: HqRelay | null } }
  /**
   * For the Fleet Console's screens (fleetRecord.ts), each answered only when `byUserId`, the fleet admin asking, holds
   * the role (`not_allowed` otherwise); an hq older than 1.4 answers `unknown_method`. The record of what fleet admins
   * did, newest first, a page at a time: `after` is the `next` of the page before.
   */
  'activity.list': { params: { byUserId: string; after?: string }; result: FleetActivityPage }
  /** The notices hq keeps for that fleet admin about the fleet, and nothing else of theirs. */
  'notices.list': { params: { byUserId: string }; result: { notices: FleetNotice[] } }
  /** Puts one of those notices away, in hq too; one that clears itself is refused (`not_allowed`). */
  'notices.dismiss': { params: { byUserId: string; noticeId: string }; result: { dismissed: boolean } }
  /** An account by the username it signs in with, exactly, to give it the role; null when there is none. */
  'account.find': { params: { byUserId: string; username: string }; result: { account: HqAccount | null } }
  /**
   * What hq needs to decide its *not heard from* notice for a machine (stopping.ts): whether its fleet admins asked to
   * be told when it stops answering, and when its host service said it stops on purpose (null once it answers again).
   * A notification preference only: it gives no authority over the machine. Sent when either changes and each time
   * the link comes up; an hq older than 1.5 answers `unknown_method`. `kept` is false for a machine hq does not list.
   */
  'host.silenceFacts': { params: HostSilenceFacts; result: { kept: boolean } }

  // ── Live previews on the organisation's sites (livePreviews.ts), since 1.3 ──
  // Each is answered only when `byUserId` holds the fleet admin role (`not_allowed` otherwise).
  /** The site's *Live previews on this site*, its limit and idle stop, its open live previews, and what they use. */
  'sites.livePreviews': { params: { byUserId: string; executionSiteId: string }; result: SiteLivePreviewsView }
  /**
   * Sets *Live previews on this site*, its limit (null: none) and *Stop when unused for* in minutes. Turning it off
   * stops every live preview open there, each person told, `stopped` naming them; lowering the limit stops none.
   * Announced.
   */
  'sites.livePreviews.set': {
    params: { byUserId: string; executionSiteId: string; allowed: boolean; limit: LivePreviewLimit; idleMinutes: number }
    result: { view: SiteLivePreviewsView; stopped: string[] }
  }
  /** Stops one live preview on the site; its people are told a fleet admin stopped it. `stopped` is false for one already stopped. Announced. */
  'sites.livePreviews.stop': {
    params: { byUserId: string; executionSiteId: string; livePreviewId: string }
    result: { stopped: boolean }
  }

  // ── hq's connection to Agenthix Cloud (the connection protocol, core/src/cloud) ──
  // hq holds the connection and its key, and is the only party that talks to Cloud about it; the Fleet Console starts
  // and ends it for a fleet admin. Each is answered only when `byUserId` holds the fleet admin role (`not_allowed`
  // otherwise); an hq older than 1.6 answers `unknown_method`.
  /** The connection, a request still waiting on approval, and how the last request ended. */
  'cloud.state': { params: { byUserId: string }; result: HqCloudState }
  /**
   * Asks Cloud for a connection, or answers the one already waiting: the user code the admin checks and the page they
   * approve it on. Only for a fleet admin who is also an organisation admin (`not_allowed`); `failed` when Cloud did
   * not answer as the protocol says, or hq is connected already.
   */
  'cloud.connect': { params: { byUserId: string }; result: { connecting: CloudConnecting } }
  /**
   * Revokes the connection at Cloud and forgets it and its key, or drops a request still waiting. hq forgets them
   * even when Cloud cannot be reached, so the key can never be used again. As `cloud.connect`, organisation admins
   * only. `disconnected` is false when there was nothing to end.
   */
  'cloud.disconnect': { params: { byUserId: string }; result: { disconnected: boolean } }

  // ── What the platform shows of Cloud to fleet admins (the Fleet Console's Cloud section and offers) ──
  // Each is answered only when `byUserId` holds the fleet admin role (`not_allowed` otherwise); an hq older than 1.7
  // answers `unknown_method`. None of them calls Cloud.
  /** How many people asked, in Settings › Sign-in, to sign in with Agenthix Cloud. */
  'cloud.askCount': { params: { byUserId: string }; result: { count: number } }
  /** The offers this person has dismissed; an offer dismissed stays gone for them, wherever it appears. */
  'cloud.offers': { params: { byUserId: string }; result: { dismissed: CloudOfferName[] } }
  'cloud.dismissOffer': { params: { byUserId: string; offer: CloudOfferName }; result: { dismissed: CloudOfferName[] } }
  /**
   * The flagged features on for the organisation (adr-0172), by core's rule with its switches: the Fleet Console shows a
   * flagged feature's section only while it is listed. Flags travel as names, so adding or removing one changes no
   * protocol; the Fleet Console keeps only names it knows. An hq older than 1.3 answers `unknown_method`, read as none.
   */
  'features.on': { params: Record<string, never>; result: { on: string[] } }
}

/** The places Cloud removes a limit a fleet admin has hit: no site available, backups kept on the machine, domain and HTTPS. */
export const CLOUD_OFFER_NAMES = ['site', 'backups', 'address'] as const
export type CloudOfferName = (typeof CLOUD_OFFER_NAMES)[number]

export type HostSilenceFacts = { hostId: string; notifyIfSilent: boolean; stoppedAt: string | null }

export type ConsoleLinkMethod = keyof ConsoleLinkMethods

export const CONSOLE_LINK_METHODS = [
  'signIn.check', 'join.open', 'join.close', 'join.accept', 'join.refuse', 'host.list', 'host.disconnect',
  'site.register', 'site.remove', 'fleetAdmin.grant', 'activity.record', 'fleetAdmin.revoke', 'fleetAdmin.list',
  'handover.open', 'handover.accept', 'handover.close', 'transfer.open', 'transfer.close', 'site.move',
  'hq.about', 'site.loads', 'relay.facts', 'activity.list', 'notices.list', 'notices.dismiss', 'account.find',
  'host.silenceFacts', 'sites.livePreviews', 'sites.livePreviews.set', 'sites.livePreviews.stop',
  'cloud.state', 'cloud.connect', 'cloud.disconnect',
  'cloud.askCount', 'cloud.offers', 'cloud.dismissOffer', 'features.on',
] as const satisfies readonly ConsoleLinkMethod[]

/** A request on the console link: one of `ConsoleLinkMethods`, with that method's params. */
export type ConsoleLinkRequest = {
  [M in ConsoleLinkMethod]: { method: M; params: ConsoleLinkMethods[M]['params'] }
}[ConsoleLinkMethod]

/** `rate_limited`: `signIn.check` while too many wrong passwords came through the link (hq's sign-in limit). */
export type ConsoleLinkErrorCode = 'unknown_method' | 'not_allowed' | 'not_found' | 'malformed' | 'failed' | 'rate_limited'

/** Frames on the console link. */
export type ConsoleLinkFrame =
  | RelayFrame<'ping' | 'pong', Record<string, never>>
  | RelayFrame<'relay.envelope', { envelope: HostEnvelope }>
  | RelayFrame<'relay.undeliverable', { envelopeId: string; reason: RelayUndeliverableReason }>
  | RelayFrame<'console.request', ConsoleLinkRequest>
  /** The answer to a `console.request`, matched by `replyTo`: that method's result. */
  | RelayFrame<'console.response', ConsoleLinkMethods[ConsoleLinkMethod]['result']>
  | RelayFrame<'console.error', { code: ConsoleLinkErrorCode; message: string }>
  /** hq → console: a machine joining with one of its codes, for the fleet admin to confirm. */
  | RelayFrame<'join.request', { joinId: string; identity: HostIdentity; machineName: string; runsHq?: true; binding: string }>
  | RelayFrame<'host.presence', { hostId: string; fingerprint: string; online: boolean; since: string }>
  /** hq → console: this person no longer holds the fleet admin role, so their sessions end now. */
  | RelayFrame<'fleetAdmin.removed', { userId: string }>
  /** hq → console, first frame after a code was redeemed: the lasting credential, which exists only here. */
  | RelayFrame<'console.credential', { credential: string }>
  /** New console → hq, first frame on a connection opened with a code's lookup; ignored when it was hq's own code. */
  | RelayFrame<'console.handoverAsk', ConsoleHandoverAsk>
  /** hq → the running console: a new one asks to take its place, with the handover it opened. */
  | RelayFrame<'console.handoverRequest', { handoverId: string; ask: ConsoleHandoverAsk }>
  /** hq → the new console: the running one's answer. */
  | RelayFrame<'console.handover', ConsoleHandoverAcceptance>
  /**
   * New console → hq, once it holds the machines: the certificate they will follow. hq then gives it its credential
   * (`console.credential`) and keeps the running one until the new one acknowledges it.
   */
  | RelayFrame<'console.handoverDone', { certificate: ConsoleHandoverCertificate }>
  /**
   * New console → hq: it keeps the credential. Only now is the move done: hq retires the running one and hands the
   * certificate to every machine. A new console whose connection dropped before this frame completes the move by
   * presenting the credential instead.
   */
  | RelayFrame<'console.handoverAck', Record<string, never>>
  /** Console → hq, its first frame once usable: whether this Fleet Console has just started (its joins' codes live in memory). */
  | RelayFrame<'console.hello', { started: boolean }>
  /** hq → console, before hq stops to move: the address it moves to. */
  | RelayFrame<'hq.address', HqAddressFrame>
