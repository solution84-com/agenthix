/**
 * What opening a file answers (spec part 1, *Opening a file*), shared by hq's *open* operation and the page that draws
 * the file: the file's facts and its links on the relay, or one of the states the frame words (part 2, F4).
 */
import { ticketPathPrefix, type RelayDoor } from '../relay/door.js'
import type { FileFacts } from './contract.js'
import type { FileKind } from './kind.js'

export const FILE_OPEN_STATES = [
  'ready', 'no-files-address', 'no-relay', 'relay-unavailable', 'site-unavailable', 'not-found', 'linked',
] as const
export type FileOpenState = (typeof FILE_OPEN_STATES)[number]

/** The links' tickets end together; `expiresAt` is in milliseconds since the epoch, so the page knows to open again. */
type Links = { downloadLink: string; expiresAt: number }

export type FileOpenAnswer =
  | ({ state: 'ready'; facts: FileFacts; previewLink: string } & Links)
  /** A kind whose viewer needs the files address, on an installation without one: it can still be downloaded. */
  | ({ state: 'no-files-address'; facts: FileFacts } & Links)
  /** The site holding it has no relay yet. */
  | { state: 'no-relay'; siteName: string }
  /** The site's relay isn't answering: "Files on {siteName} can't be opened right now: {relayName} isn't answering." */
  | { state: 'relay-unavailable'; siteName: string; relayName: string }
  /**
   * `upgrade`: the site answers, but is too old for what was asked, so it must be upgraded first. Absent: the site
   * isn't answering.
   */
  | { state: 'site-unavailable'; upgrade?: { siteName: string } }
  /** Not there, not a file, or not the person's to open: the answer does not say which. */
  | { state: 'not-found' }
  /** The file is hard-linked to another file on the machine, so the site won't show it: its own reason, no download. */
  | { state: 'linked' }

/** Kinds drawn by a viewer page on the files address (adr-0155), so not on a bare address. */
export const KINDS_NEEDING_FILES_ADDRESS: readonly FileKind[] = ['pdf']

export const needsFilesAddress = (kind: FileKind): boolean => KINDS_NEEDING_FILES_ADDRESS.includes(kind)

/** Where a relay answers browsers: its address's origin, and which door that is. */
export type RelayAddress = { origin: string; door: RelayDoor }

const COMPACT_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/
// Core has no URL: an origin is a scheme, a host name or address, and an optional port, with nothing after it.
const ORIGIN = /^https?:\/\/([a-z0-9-]+(\.[a-z0-9-]+)*|\[[0-9a-f:.]+\])(:[0-9]{1,5})?\/?$/i

/** A ticket's link: the relay's origin and the door's ticket path. Throws on an address that is not a bare origin. */
export function fileTicketLink(relay: RelayAddress, ticket: string): string {
  if (!COMPACT_JWT.test(ticket)) throw new Error('A ticket link needs a ticket.')
  if (!ORIGIN.test(relay.origin)) throw new Error('A relay\'s address must be an http or https origin, with no path.')
  return `${relay.origin.replace(/\/$/, '')}${ticketPathPrefix(relay.door)}${ticket}`
}
