import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { credentialMatches, hashCredential } from '../sites/credentials'
import type { RelayLoad } from './relayReport'

/**
 * A relay's credential is found by its hash and then compared timing-safe. A removed relay has none, and is refused.
 */
export async function authenticateRelay(secret: string): Promise<{ relayId: string } | null> {
  const row = await prisma.relay.findUnique({ where: { credentialHash: hashCredential(secret) } })
  if (!row || row.state === 'REMOVED' || !credentialMatches(secret, row.credentialHash)) return null
  return { relayId: row.id }
}

/** A relay that speaks is on again; a removed one stays removed. */
export async function recordRelaySeen(relayId: string): Promise<void> {
  await prisma.relay.updateMany({
    where: { id: relayId, state: { not: 'REMOVED' } },
    data: { lastSeenAt: new Date(), state: 'ON' },
  })
}

export async function recordRelayReport(relayId: string, load: RelayLoad): Promise<void> {
  await prisma.relay.updateMany({
    where: { id: relayId, state: { not: 'REMOVED' } },
    data: { lastSeenAt: new Date(), state: 'ON', load: load as unknown as Prisma.InputJsonValue },
  })
}
