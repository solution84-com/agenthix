/**
 * Which visitors are using the demo now (live demo spec, *Getting in*: the overall cap). A visitor counts while they
 * were seen in the last `ACTIVE_WINDOW_MS`; one idle longer frees their seat, though their account and what they made
 * stay until the reset. Kept in hq's `RateLimit` table, one row per visitor whose window ends an hour after they were
 * last seen, so the table's own sweep drops idle visitors and the reset wipes the rest.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'

export const ACTIVE_WINDOW_MS = 60 * 60 * 1000

const SEEN_PREFIX = 'demo-seen:'

type Client = Pick<Prisma.TransactionClient, 'rateLimit'>

/** Notes that the visitor was here now. */
export async function markSeen(userId: string, client: Client = prisma, now = new Date()): Promise<void> {
  const resetAt = new Date(now.getTime() + ACTIVE_WINDOW_MS)
  await client.rateLimit.upsert({
    where: { ip: `${SEEN_PREFIX}${userId}` },
    create: { ip: `${SEEN_PREFIX}${userId}`, count: 1, resetAt },
    update: { resetAt },
  })
}

/** How many visitors were seen in the last hour. */
export async function activeVisitors(client: Client = prisma, now = new Date()): Promise<number> {
  return client.rateLimit.count({ where: { ip: { startsWith: SEEN_PREFIX }, resetAt: { gt: now } } })
}
