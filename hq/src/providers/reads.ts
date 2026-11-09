/**
 * Providers as every read gives them (models from one place, part 1, M4): name, types, state, since when, the
 * vendor's message, the key's last four characters, a custom endpoint's address and what uses it. Never a key.
 */
import { prisma } from 'wasp/server'
import { type AiProviderSummary, type ProviderRecordView } from '@agenthix/core'
import { peopleByIds } from '../server/identity/people'
import { providerStore, type ProviderRow } from './store'
import { typesOfVendor } from './typeGate'

export async function summaryOf(p: ProviderRow): Promise<AiProviderSummary> {
  return {
    id: p.id,
    name: p.name,
    vendor: p.vendor,
    types: [...await typesOfVendor(p.vendor)],
    credential: p.credentialKind,
    baseUrl: p.baseUrl,
    keyHint: p.keyHint,
    state: p.state,
    stateSince: p.stateSince.toISOString(),
    stateDetail: p.stateDetail,
    lastCheckedAt: p.lastCheckedAt?.toISOString() ?? null,
    lastWorkedAt: p.lastWorkedAt?.toISOString() ?? null,
    usedBy: await providerStore().usesOf(p.id),
    // Costs are written to the ledger from phase 4 of this work; until then there are none to sum.
    costThisMonth: [],
    createdAt: p.createdAt.toISOString(),
  }
}

/** The organisation's providers, oldest first. */
export async function listProviderSummaries(): Promise<AiProviderSummary[]> {
  return Promise.all((await providerStore().list()).map(summaryOf))
}

const RECORDS_SHOWN = 50

/** A provider's records, newest first; they outlive it, so a removed provider's can still be read by its id. */
export async function providerRecords(providerId: string): Promise<ProviderRecordView[]> {
  const rows = await prisma.aiProviderRecord.findMany({ where: { providerId }, orderBy: { at: 'desc' }, take: RECORDS_SHOWN })
  const people = await peopleByIds(rows.flatMap(r => (r.byUserId ? [r.byUserId] : [])))
  return rows.map(r => ({
    id: r.id,
    at: r.at.toISOString(),
    providerId: r.providerId,
    providerName: r.providerName,
    action: r.action,
    actor: r.actor,
    by: r.byUserId ? { id: r.byUserId, name: people.get(r.byUserId)?.name ?? '' } : null,
    detail: r.detail,
  }))
}
