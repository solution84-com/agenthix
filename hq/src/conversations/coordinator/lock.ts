/**
 * The one-turn lock (conversation layer spec, Inference turn; adr-0075): at most one turn owns a conversation's
 * inference at a time, across processes. The lock is `Conversation.activeTurnId` with a lease, claimed by one
 * conditional update — set only where it is free or its lease has run out — renewed while the turn runs and
 * released at its end. A process that dies holding it loses it when the lease runs out, and recovery fails the
 * turn it held.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'

/** How long a claim holds without renewal. */
export const TURN_LEASE_MS = 30_000
/** How often a running turn renews its lease: well inside the lease, so one slow renewal never loses it. */
export const TURN_RENEW_MS = 10_000

type Db = Prisma.TransactionClient | typeof prisma

export function leaseUntil(now: Date): Date {
  return new Date(now.getTime() + TURN_LEASE_MS)
}

/** Free, or held by a turn whose lease has run out. */
export function lockFree(now: Date): Prisma.ConversationWhereInput {
  return { OR: [{ activeTurnId: null }, { activeTurnLeaseUntil: null }, { activeTurnLeaseUntil: { lt: now } }] }
}

/** Claims the lock for `turnId`; false when another turn holds it. */
export async function claimLock(db: Db, conversationId: string, turnId: string, now: Date): Promise<boolean> {
  const { count } = await db.conversation.updateMany({
    where: { id: conversationId, ...lockFree(now) },
    data: { activeTurnId: turnId, activeTurnLeaseUntil: leaseUntil(now) },
  })
  return count === 1
}

/** Extends the lease of a turn that still holds the lock; false when it no longer does. */
export async function renewLock(conversationId: string, turnId: string, now: Date = new Date()): Promise<boolean> {
  const { count } = await prisma.conversation.updateMany({
    where: { id: conversationId, activeTurnId: turnId },
    data: { activeTurnLeaseUntil: leaseUntil(now) },
  })
  return count === 1
}

/** Releases the lock, only if `turnId` still holds it. */
export async function releaseLock(db: Db, conversationId: string, turnId: string): Promise<void> {
  await db.conversation.updateMany({
    where: { id: conversationId, activeTurnId: turnId },
    data: { activeTurnId: null, activeTurnLeaseUntil: null },
  })
}
