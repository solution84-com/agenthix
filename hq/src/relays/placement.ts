import { prisma } from 'wasp/server'
import { RELAY_SITE_LINE_PATH } from '@agenthix/core'
import type { Relay } from '@prisma/client'
import { Logger } from '../server/utils/logger'
import { BAD_RELAY_LINE_URL_MESSAGE, hqRelayLine, hqRelayLineOverride } from './hqRelayLine'

const logger = new Logger('relays')

/** Where a site holds its file line: the relay, and the address it dials for the line. */
export type Placement = { relayId: string; lineUrl: string }

const usable = { state: { not: 'REMOVED' as const }, credentialHash: { not: null } }

/**
 * hq's relay is reached through `hq-web` on hq's own address, which every site already dials, so its line is a path
 * the site resolves against that address. Any other relay is dialled on its own address. Null when it has none.
 */
export function lineUrlFor(relay: Pick<Relay, 'isHq' | 'address'>): string | null {
  if (relay.isHq) return hqRelayLine()
  if (!relay.address) return null
  try {
    return new URL(RELAY_SITE_LINE_PATH, relay.address).toString()
  } catch {
    return null
  }
}

function isUsable(relay: Pick<Relay, 'state' | 'credentialHash'>): boolean {
  return relay.state !== 'REMOVED' && relay.credentialHash !== null
}

/**
 * The relay a site holds its line to. A site without a usable relay is placed on hq's relay (spec part 1, *More relays
 * and placement*: every site starts there). Null when the site is unknown or removed, or no relay is available —
 * the site then gets no assignment, and opening a file says so.
 */
export async function placeSite(siteId: string): Promise<Placement | null> {
  const site = await prisma.executionSite.findUnique({ where: { siteId }, include: { relay: true } })
  if (!site || site.status === 'REVOKED') return null
  if (site.relay && isUsable(site.relay)) {
    const lineUrl = lineUrlFor(site.relay)
    if (lineUrl) return { relayId: site.relay.id, lineUrl }
  }
  const hq = await prisma.relay.findFirst({ where: { isHq: true, ...usable } })
  if (!hq) return null
  await prisma.executionSite.update({ where: { id: site.id }, data: { relayId: hq.id } })
  return { relayId: hq.id, lineUrl: hqRelayLine() }
}

/** At boot: every site with no relay is placed on hq's relay, so the record says where each will dial. */
export async function placeUnplacedSites(): Promise<number> {
  if (hqRelayLineOverride().invalid) logger.warn(BAD_RELAY_LINE_URL_MESSAGE)
  const hq = await prisma.relay.findFirst({ where: { isHq: true, ...usable } })
  if (!hq) return 0
  const { count } = await prisma.executionSite.updateMany({
    where: { relayId: null, status: { not: 'REVOKED' } },
    data: { relayId: hq.id },
  })
  return count
}
