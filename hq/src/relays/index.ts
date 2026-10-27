import type { Server as HttpServer } from 'node:http'
import { attachRelayLink, RelayLinks } from './relayLinkServer'
import { authenticateRelay, recordRelayReport, recordRelaySeen } from './relayStore'

export { ensureHqRelay, NO_HQ_RELAY_MESSAGE } from './hqRelay'
export { placeUnplacedSites } from './placement'
export { issueFileTicket, type FileOpenedEntry } from './fileTickets'

/** The relays connected to hq now: the open operation answers `relay-unavailable` at once for one that is not. */
export const relayLinks = new RelayLinks()

export function isRelayConnected(relayId: string): boolean {
  return relayLinks.isConnected(relayId)
}

/** The relays' links to hq, at `RELAY_HQ_LINK_PATH`. */
export function startRelayLink(server: HttpServer) {
  return attachRelayLink(server, {
    authenticate: authenticateRelay,
    recordSeen: recordRelaySeen,
    recordReport: recordRelayReport,
  }, relayLinks)
}
