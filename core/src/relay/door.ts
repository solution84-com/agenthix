/**
 * The two doors a relay answers browsers at, and how it sends an answer at each.
 *
 * - **The files address**: its own name (`files.example.com`, `files.localhost`), another origin from hq's, with no
 *   session. A ticket's link is `RELAY_TICKET_PATH_PREFIX` + ticket there.
 * - **A bare address**: an installation with no name for files. `hq-web` sends every path under
 *   `RELAY_BARE_PATH_PREFIX` on the app's own address to hq's relay, unchanged, so a link is `/relay/t/<ticket>` on
 *   hq's address. That is hq's origin, so nothing is answered inline there (adr-0114): downloads work, and text works
 *   because the page reads it and draws it as text; a PDF's viewer needs the files address.
 *
 * The relay applies the bare address's rule to a request that comes under the bare prefix or to any host but its files
 * host, whichever path it came by.
 */
import { RELAY_TICKET_PATH_PREFIX } from './protocol.js'
import type { TicketPurpose } from './tokens.js'

export const RELAY_DOORS = ['files-address', 'bare-address'] as const
export type RelayDoor = (typeof RELAY_DOORS)[number]

/** With its slash, so neither `/relay-line` nor `/relay-link` falls under it. */
export const RELAY_BARE_PATH_PREFIX = '/relay/'
export const RELAY_BARE_TICKET_PATH_PREFIX = `${RELAY_BARE_PATH_PREFIX}${RELAY_TICKET_PATH_PREFIX.slice(1)}`

/**
 * Each door's rule, as data. `inline`: whether a preview may be shown in the browser at all. `previewTypes`: which
 * content types a preview keeps — the site's guess, or (bare) only a picture's type, every other preview being sent as
 * plain text for the page to read.
 */
export const RELAY_DOOR_RULES: Record<RelayDoor, { inline: boolean; previewTypes: 'as-guessed' | 'pictures-only' }> = {
  'files-address': { inline: true, previewTypes: 'as-guessed' },
  'bare-address': { inline: false, previewTypes: 'pictures-only' },
}

export function ticketPathPrefix(door: RelayDoor): string {
  return door === 'bare-address' ? RELAY_BARE_TICKET_PATH_PREFIX : RELAY_TICKET_PATH_PREFIX
}

const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}(; ?charset=[a-z0-9_-]{1,40})?$/i
const OCTETS = 'application/octet-stream'
const PLAIN_TEXT = 'text/plain; charset=utf-8'
const PICTURES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml', 'image/x-icon', 'image/bmp'])

export type RelayAnswerForm = { contentType: string; disposition: 'inline' | 'attachment' }

/**
 * The type and disposition an answer is sent with. The site's guess is only a guess, and comes from a site: a value
 * that is not a plain media type is replaced, and a download is always an octet stream, so nothing the browser saves
 * is opened as anything else. On a bare address everything is an attachment: a picture keeps its type, so an `<img>`
 * draws it, and every other preview is plain text, which a navigation only saves.
 */
export function relayAnswerForm(door: RelayDoor, purpose: TicketPurpose, guess: string): RelayAnswerForm {
  const rule = RELAY_DOOR_RULES[door]
  const disposition = purpose === 'preview' && rule.inline ? 'inline' : 'attachment'
  if (purpose === 'download') return { contentType: OCTETS, disposition }
  if (rule.previewTypes === 'pictures-only') {
    return { contentType: PICTURES.has(guess.toLowerCase()) ? guess.toLowerCase() : PLAIN_TEXT, disposition }
  }
  return { contentType: MEDIA_TYPE.test(guess) ? guess : OCTETS, disposition }
}
