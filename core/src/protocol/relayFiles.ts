/**
 * The site protocol's half of relays (adr-0153):
 *
 * - `relay.assign`, on the control channel: hq tells a site which relay to hold a line to, with the pass that admits
 *   it. Sent again with the same relay before the pass ends, it renews the pass and the line carries on; sent with
 *   another relay, the site opens the new line before it closes the old one, so open files carry on.
 * - `files.serve`, on the content transport: a relay asks a site for a file on a ticket. The site trusts nothing the
 *   relay says: it verifies the ticket itself (`verifyRelayToken`), confines the path to the place's storage, checks
 *   the version, and answers with a head (`encodeStreamHead`) and then the bytes.
 */

export const RELAY_ASSIGN_METHOD = 'relay.assign'
export const FILES_SERVE_METHOD = 'files.serve'

export type RelayAssignParams = {
  relayId: string
  /**
   * Where the site dials the relay's line: an absolute `ws:`/`wss:`/`http:`/`https:` address, or a path resolved
   * against the address the site already dials hq on (as the content channel's is). hq's own relay is a path.
   */
  lineUrl: string
  /** A relay pass: `sub` this site, `aud` the relay. Sent as the line's bearer credential. */
  pass: string
  /** When the pass expires, in milliseconds since the epoch. */
  passExpiresAt: number
}

export type RelayAssignResult = {
  /** False when the site refused the assignment (an address it may not dial); `problem` says why. */
  taken: boolean
  problem?: string
}

export type FilesServeParams = {
  /** The ticket from the browser's link, untouched. Never logged. */
  ticket: string
  /** The browser's `Range` header, untouched; the site reads it with `parseByteRange`. */
  range?: string
  /** A `HEAD` request: the site answers the head and no bytes. */
  headOnly?: boolean
}
