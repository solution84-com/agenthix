/**
 * The relay protocol (adr-0153): what a relay speaks with the sites assigned to it and with hq, as `major.minor`, under
 * the same rule as every other connection (`checkProtocolCompatibility`, docs/architecture/versioning.md).
 *
 * - **The site line.** A site dials its relay at `RELAY_SITE_LINE_PATH`, a WebSocket, with `Authorization: Bearer
 *   <relay pass>`, `X-Site-Id`, `X-Site-Protocol-Version` (what its streams speak: `files.serve` came in site protocol
 *   1.8) and `X-Relay-Protocol-Version` (what the line speaks). The relay keeps one line per site, replacing it when
 *   the site dials again. On the line the content channel's frames and multiplexer are reused unchanged
 *   (content.ts, contentMux.ts): the relay is the opener, the site the server.
 * - **The hq link.** A relay dials hq at `RELAY_HQ_LINK_PATH`, a WebSocket, with `Authorization: Bearer <secret>` and
 *   `X-Relay-Protocol-Version`. hq greets it with `RelayLinkWelcome`; the relay reports with `RelayLinkReport` every
 *   `RELAY_REPORT_INTERVAL_MS`. It fetches hq's key set from `HQ_JWKS_PATH`, and again on an unknown key id.
 * - **A browser** fetches `GET` or `HEAD` `RELAY_TICKET_PATH_PREFIX` + ticket on the relay's files address, or, on an
 *   installation with no name for files, `RELAY_BARE_TICKET_PATH_PREFIX` + ticket on hq's own address (door.ts).
 */

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
}

export type RelayLinkFrame = RelayLinkWelcome | RelayLinkReport
