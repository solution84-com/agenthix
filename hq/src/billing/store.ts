/**
 * The ledger's rows in the database, and the one writer hq's sources share. Rows are only ever created here: nothing
 * in hq updates or deletes a `UsageEntry`.
 */
import { prisma } from 'wasp/server'
import type { Prisma, PrismaClient } from '@prisma/client'
import { isFeatureOn, NO_FEATURE_SWITCHES } from '@agenthix/core'
import { createLedger, type Ledger, type LedgerStore } from './writer'
import { ensureDefaultBillingProfile } from './defaultProfile'
import type { StoredCall } from './types'

type Db = PrismaClient | Prisma.TransactionClient

export function ledgerStore(db: Db = prisma): LedgerStore {
  return {
    async insertCall(row) {
      // ON CONFLICT DO NOTHING, against the partial unique index on a CALL row's call id.
      const { count } = await db.usageEntry.createMany({ data: [row], skipDuplicates: true })
      return count === 1
    },
    async findCall(callId) {
      return (await db.usageEntry.findFirst({ where: { callId, kind: 'CALL' } })) as StoredCall | null
    },
    async append(row) {
      await db.usageEntry.create({ data: row })
    },
    async hasActual(callRowId, amountMicros, currency) {
      return (await db.usageEntry.count({ where: { refersTo: callRowId, kind: 'ACTUAL', amountMicros, currency } })) > 0
    },
    defaultProfileId: () => ensureDefaultBillingProfile(db),
  }
}

/** Whether Agenthix Cloud reports actual costs (the `usageBilling` flag). */
export function usageBillingOn(): boolean {
  return isFeatureOn('usageBilling', { env: process.env, switches: NO_FEATURE_SWITCHES })
}

/** The writer on the database, or inside a transaction. Cloud's catalogue is read in phase 5. */
export function ledger(db: Db = prisma): Ledger {
  return createLedger(ledgerStore(db), { usageBilling: usageBillingOn(), cloudCatalogue: null })
}
