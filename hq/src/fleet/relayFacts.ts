/**
 * `relay.facts` (core's hqFacts.ts): hq's own relay as the Fleet Console's HQ page shows it. Nothing an organisation
 * admin does not see in HQ's files settings: the address is the one people's browsers use, the figures are the relay's
 * own report. No credential is read.
 */
import { prisma } from 'wasp/server'
import type { HqRelay } from '@agenthix/core'
import { filesPlace } from '../server/files/filesOrigin'

/** The relay reports every 15 seconds; a minute without a word is not answering. */
export const RELAY_SILENT_AFTER_MS = 60_000

export type RelayFactsRow = { name: string; state: string; lastSeenAt: Date | null; load: unknown }

const count = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null)

export function relayFactsOf(row: RelayFactsRow, filesAddress: string | null, now: Date): HqRelay {
  const load = typeof row.load === 'object' && row.load !== null && !Array.isArray(row.load) ? (row.load as Record<string, unknown>) : {}
  const answering = row.state === 'ON' && row.lastSeenAt !== null && now.getTime() - row.lastSeenAt.getTime() < RELAY_SILENT_AFTER_MS
  return {
    name: row.name,
    filesAddress,
    answering,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    sites: Array.isArray(load.sites) ? load.sites.length : null,
    openStreams: count(load.openStreams),
    bytesCarried: count(load.bytesCarried),
  }
}

export async function relayFacts(now: Date = new Date()): Promise<{ relay: HqRelay | null }> {
  const row = await prisma.relay.findFirst({
    where: { isHq: true, state: { not: 'REMOVED' } },
    select: { name: true, state: true, lastSeenAt: true, load: true },
  })
  if (!row) return { relay: null }
  const place = filesPlace()
  return { relay: relayFactsOf(row, place.mode === 'origin' ? place.origin : null, now) }
}
