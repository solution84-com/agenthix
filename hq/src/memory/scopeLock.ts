import type { Prisma } from '@prisma/client'

/** Taken first in every writing transaction, so the duplicate check, the count and the write see one scope at rest. */
export async function lockScope(tx: Prisma.TransactionClient, scopeKey: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`memory:${scopeKey}`}, 0))`
}
