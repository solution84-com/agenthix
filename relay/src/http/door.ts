/**
 * Which door a browser's request came by (core's `RELAY_DOORS`): `/t/<ticket>` on the files host, or
 * `/relay/t/<ticket>` on the app's own host, which hq-web passes through unchanged on an installation with no files
 * address. Anything else is no ticket request. The bare door is hq's origin, so its rule is core's `bare-address` one;
 * a kind that cannot be read without being shown inline there (a PDF's preview) is refused rather than sent.
 */
import {
  RELAY_BARE_TICKET_PATH_PREFIX, RELAY_TICKET_PATH_PREFIX, chooseFileKind, needsFilesAddress,
  type RelayDoor, type TicketPurpose,
} from '@agenthix/core'
import { hostOf, isFilesHost } from '../filesHost'

/** The characters of a compact JWT; anything else in the path is not a ticket. */
const TICKET = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/

export type DoorHosts = { filesHost: string | null; appOrigin: string | null }

export function appHostOf(appOrigin: string | null): string | null {
  if (!appOrigin) return null
  try {
    return hostOf(new URL(appOrigin).host) || null
  } catch {
    return null
  }
}

/** The door and the ticket, or null when the request is not for a ticket at a door this relay answers. */
export function ticketAtDoor(hostHeader: string | undefined, path: string, hosts: DoorHosts): { door: RelayDoor; ticket: string } | null {
  let door: RelayDoor
  let prefix: string
  if (isFilesHost(hostHeader, hosts.filesHost) && path.startsWith(RELAY_TICKET_PATH_PREFIX)) {
    door = 'files-address'
    prefix = RELAY_TICKET_PATH_PREFIX
  } else {
    const appHost = appHostOf(hosts.appOrigin)
    if (!appHost || hostOf(hostHeader) !== appHost || !path.startsWith(RELAY_BARE_TICKET_PATH_PREFIX)) return null
    door = 'bare-address'
    prefix = RELAY_BARE_TICKET_PATH_PREFIX
  }
  const ticket = path.slice(prefix.length)
  return TICKET.test(ticket) ? { door, ticket } : null
}

export const BARE_REFUSAL = "This file can't be shown on HQ's own address: it needs a files address. Download it instead, or ask an administrator to set up a files address."

/** Whether the bare door refuses this answer: a preview of a kind that needs the files address to be drawn. */
export function bareRefuses(door: RelayDoor, purpose: TicketPurpose, fileName: string): boolean {
  return door === 'bare-address' && purpose === 'preview' && needsFilesAddress(chooseFileKind(fileName, true).kind)
}
