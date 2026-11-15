/**
 * The relay protocol (adr-0153): what a relay speaks with the sites assigned to it and with hq, as `major.minor`, under
 * the same rule as every other connection (`checkProtocolCompatibility`, docs/architecture/versioning.md).
 *
 * - **The site line.** A site dials its relay at `RELAY_SITE_LINE_PATH`, a WebSocket, with `Authorization: Bearer
 *   <relay pass>`, `X-Site-Id`, `X-Site-Protocol-Version` (what its streams speak, `files.serve` among them) and
 *   `X-Relay-Protocol-Version` (what the line speaks). The relay keeps one line per site, replacing it when
 *   the site dials again. On the line the content channel's frames and multiplexer are reused unchanged
 *   (content.ts, contentMux.ts): the relay is the opener, the site the server.
 * - **The hq link.** A relay dials hq at `RELAY_HQ_LINK_PATH`, a WebSocket, with `Authorization: Bearer <secret>` and
 *   `X-Relay-Protocol-Version`. hq greets it with `RelayLinkWelcome`; the relay reports with `RelayLinkReport` every
 *   `RELAY_REPORT_INTERVAL_MS`. It fetches hq's key set from `HQ_JWKS_PATH`, and again on an unknown key id.
 * - **A browser** fetches `GET` or `HEAD` `RELAY_TICKET_PATH_PREFIX` + ticket on the relay's files address, or, on an
 *   installation with no name for files, `RELAY_BARE_TICKET_PATH_PREFIX` + ticket on hq's own address (door.ts).
 * - **A live app's address** (previewAddress.ts, appDoor.ts): every request and WebSocket on its own
 *   `app.serve` stream on the site's line, after the relay asked hq (`relay.ask`) whether the ticket behind the
 *   cookie still stands. hq pushes `relay.revoke` when an app, a live preview or a person is cut off.
 * - **Bundles** between two sites' lines (`bundle.read`, `bundle.write`): hq hands the relay a bundle ticket
 *   with `relay.bundle`; the relay reports with `relay.bundleReport` only what the sites cannot (an end offline, a
 *   stream broken). The destination site reports what it kept to hq itself (`bundle.landed`).
 * - **A workspace file at a commit**: a ticket for a place's file may name a `commit` (refs.ts), served by
 *   the site from the workspace's repository. The relay routes it as any other ticket.
 */
import type { RelayAppRefusal } from './appDoor.js'

export const RELAY_PROTOCOL_VERSION = '1.0'
export const RELAY_PROTOCOL_VERSION_HEADER = 'X-Relay-Protocol-Version'

export const RELAY_SITE_LINE_PATH = '/relay-line'
export const RELAY_HQ_LINK_PATH = '/relay-link'
export const RELAY_TICKET_PATH_PREFIX = '/t/'

/** The header a site names itself in when it dials its relay, as when it dials hq. */
export const RELAY_SITE_ID_HEADER = 'X-Site-Id'

export const RELAY_REPORT_INTERVAL_MS = 15_000

/** The most streams one person may have open at a relay at once: thumbnails and a PDF, not a runaway script. */
export const RELAY_STREAMS_PER_PERSON = 16
/** The most ticket reads a site serves at once; beyond this they wait. A site's disk is shared with its agents. */
export const SITE_CONCURRENT_FILE_READS = 32

/** hq → relay, once the link is up: who the relay is, which the passes it accepts name as their audience. */
export type RelayLinkWelcome = {
  type: 'relay.welcome'
  version: string
  relayId: string
}

/** relay → hq, on a timer: whether it is alive, and its load. */
export type RelayLinkReport = {
  type: 'relay.report'
  version: string
  /** When the relay started, ISO; `bytesCarried` counts from then, so a lost report loses nothing. */
  startedAt: string
  /** The ids of the sites that hold a line to it now. */
  sites: string[]
  openStreams: number
  bytesCarried: number
  /** The refusals for each app since the last report, for the guard's threshold. */
  appRefusals?: { appId: string; refusal: RelayAppRefusal; count: number }[]
}

/**
 * relay → hq, before every new stream to an app: does the ticket behind this cookie still stand? `askId` is the
 * relay's own, to match the answer. The relay carries nothing until hq answers yes, and refuses when no answer comes
 * within `RELAY_ASK_TIMEOUT_MS`.
 */
export type RelayAsk = {
  type: 'relay.ask'
  version: string
  askId: string
  /** The app ticket's `jti`. */
  ticketId: string
  person: string
  appId: string
  livePreviewId: string
}

/** hq → relay: the answer to one `relay.ask`. */
export type RelayAnswer = { type: 'relay.answer'; version: string; askId: string; stands: boolean }

export const RELAY_ASK_TIMEOUT_MS = 5_000

/**
 * hq → relay when something is cut off: every open stream it covers ends at once, and every cookie whose ticket it
 * covers is forgotten. `person`: every ticket of theirs (they lost access to the project, or were removed).
 * `apps`, `livePreviews`, `tickets`: those, whoever's.
 */
export type RelayRevoke = {
  type: 'relay.revoke'
  version: string
  person?: string
  apps?: string[]
  livePreviews?: string[]
  tickets?: string[]
}

/** hq → relay: carry one bundle, opening `bundle.read` on `from`'s line and `bundle.write` on `to`'s. */
export type RelayBundleOrder = {
  type: 'relay.bundle'
  version: string
  /** The bundle ticket's `jti`. */
  transferId: string
  /** The bundle ticket, untouched; the sites verify it. Never logged. */
  ticket: string
  from: string
  to: string
}

/**
 * Why a bundle did not get as far as the destination's answer, as the relay saw it:
 * - `offline`: an end's site holds no line to this relay (`site` names it);
 * - `source-refused`: the source answered a refusal (`refusal` says which, core's `BundleServeRefusal`);
 * - `broken`: a stream failed part-way; the destination keeps nothing of it.
 */
export const RELAY_BUNDLE_FAILURES = ['offline', 'source-refused', 'broken'] as const
export type RelayBundleFailure = (typeof RELAY_BUNDLE_FAILURES)[number]

/** relay → hq once a transfer ends: `done` once the destination answered (what it answered is its own `bundle.landed`). */
export type RelayBundleReport = {
  type: 'relay.bundleReport'
  version: string
  transferId: string
  outcome: { done: true } | { done: false; failure: RelayBundleFailure; site?: string; refusal?: string }
}

export type RelayLinkFrame =
  | RelayLinkWelcome | RelayLinkReport | RelayAsk | RelayAnswer | RelayRevoke | RelayBundleOrder | RelayBundleReport
