/**
 * The ledger against the real test database: the partial unique index counts a call once, rows are only added, the
 * view gives each call its latest cost, the report keeps bases apart and names an erased person *Former member*, the
 * relay's reports are written to their run's place, and billing profiles refuse what the rules refuse.
 *
 * Needs the migration that adds `RunCosting`, `ProjectBillingChange`, the `refersTo` index and the `UsageCallCost`
 * view (`callCostView.sql`).
 */
import { describe, expect, it, vi } from 'vitest'
import { NO_USAGE } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createProject, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { ledger } from '../store'
import { usageReport } from '../report'
import { archiveBillingProfile, createBillingProfile, makeDefaultBillingProfile, setProjectBillingProfile } from '../profiles'
import { ensureDefaultBillingProfile } from '../defaultProfile'
import { ledgerRelayReports } from '../sources/relay'
import type { LedgerCall } from '../types'

async function org() {
  return prisma.org.create({ data: { name: 'Fernhill', timeZone: 'UTC' } as never })
}

const call = (over: Partial<LedgerCall> = {}): LedgerCall => ({
  callId: 'call-0001', at: new Date('2026-10-10T10:00:00Z'), purpose: 'conversation', basis: 'ESTIMATED', billingProfileId: '',
  providerId: 'p-ant', providerName: 'Anthropic', vendor: 'anthropic', model: 'claude-sonnet-4-5',
  usage: { ...NO_USAGE, inputTokens: 1_000_000 }, ...over,
})

describe('the ledger', () => {
  it('writes a call once, however often it is reported', async () => {
    await org()
    expect(await ledger().writeCall(call())).toBe(true)
    expect(await ledger().writeCall(call())).toBe(false)
    const rows = await prisma.usageEntry.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].amountMicros).toBe(3_000_000n)
  })

  it("gives each call its latest cost: Cloud's actual over the guide, a correction over both", async () => {
    await org()
    await ledger().writeCall(call({ vendor: 'cloud', basis: 'AWAITING_ACTUAL' }))
    let report = await usageReport('2026-10', 'profile', null)
    expect(report.rows[0].totals.map(t => t.basis)).toEqual(['AWAITING_ACTUAL'])
    await ledger().writeActual({ callId: 'call-0001', amountMicros: 4_000_000n, currency: 'USD', at: new Date('2026-10-10T10:05:00Z') })
    report = await usageReport('2026-10', 'profile', null)
    expect(report.rows[0].totals).toMatchObject([{ basis: 'ACTUAL', amountMicros: 4_000_000, calls: 1 }])
    await ledger().writeCorrection({ callId: 'call-0001', amountMicros: 3_500_000n, currency: 'USD' })
    report = await usageReport('2026-10', 'profile', null)
    expect(report.rows[0].totals).toMatchObject([{ amountMicros: 3_500_000, calls: 1 }])
    expect(await prisma.usageEntry.count()).toBe(3)
  })

  it('cuts the month in the organisation time zone', async () => {
    await prisma.org.create({ data: { name: 'Fernhill', timeZone: 'Asia/Tokyo' } as never })
    await ledger().writeCall(call({ at: new Date('2026-10-31T16:00:00Z') }))
    expect((await usageReport('2026-10', 'profile', null)).rows).toHaveLength(0)
    expect((await usageReport('2026-11', 'profile', null)).rows).toHaveLength(1)
  })

  it('keeps an erased person’s rows, named Former member', async () => {
    await org()
    const person = await createUserWithRole('MEMBER')
    await ledger().writeCall(call({ userId: person.id }))
    await prisma.user.update({ where: { id: person.id }, data: { displayName: null, erasedAt: new Date() } })
    const report = await usageReport('2026-10', 'person', null)
    expect(report.rows.map(r => r.name)).toEqual(['Former member'])
    expect(await prisma.usageEntry.count({ where: { userId: person.id } })).toBe(1)
  })

  it("writes the relay's reports to their run's place, once", async () => {
    await org()
    const profile = await ensureDefaultBillingProfile()
    await prisma.runCosting.create({ data: { runId: 'run-1', siteId: 's', sessionId: 'sess', agentId: 'a-1', projectId: 'proj-1', billingProfileId: profile } })
    await prisma.relayUsageReport.create({
      data: { callId: 'call-relay-1', siteId: 's', runId: 'run-1', providerId: 'p-gone', model: 'm', at: new Date('2026-10-10T10:00:00Z'), hasUsage: true, inputTokens: 5, upstreamStatus: 200 },
    })
    expect(await ledgerRelayReports()).toBe(1)
    expect(await ledgerRelayReports()).toBe(0)
    const row = await prisma.usageEntry.findFirstOrThrow()
    expect(row).toMatchObject({ callId: 'call-relay-1', projectId: 'proj-1', agentId: 'a-1', billingProfileId: profile, purpose: 'worker', basis: 'UNPRICED' })
    expect((await prisma.relayUsageReport.findFirstOrThrow()).ledgeredAt).not.toBeNull()
  })
})

describe('billing profiles', () => {
  it('refuse to archive the default, or one projects use until they move, and record each move', async () => {
    await org()
    const admin = await createUserWithRole('ADMIN')
    const fernhill = await ensureDefaultBillingProfile()
    const project = await createProject({ billingProfileId: fernhill })
    const { id: clientX } = await createBillingProfile({ name: 'Client X', projectIds: [project.id] }, admin.id)
    await expect(createBillingProfile({ name: 'client x' }, admin.id)).rejects.toMatchObject({ statusCode: 409 })

    await expect(archiveBillingProfile({ id: fernhill }, admin.id)).rejects.toMatchObject({ statusCode: 409, data: { reason: 'is_default' } })
    await expect(archiveBillingProfile({ id: clientX }, admin.id)).rejects.toMatchObject({ data: { reason: 'in_use', projectCount: 1 } })
    await archiveBillingProfile({ id: clientX, moveProjectsTo: fernhill }, admin.id)

    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).billingProfileId).toBe(fernhill)
    expect(await prisma.projectBillingChange.findMany({ where: { projectId: project.id }, orderBy: { changedAt: 'asc' } }))
      .toMatchObject([{ fromProfileId: fernhill, toProfileId: clientX, changedById: admin.id }, { fromProfileId: clientX, toProfileId: fernhill }])
    await expect(setProjectBillingProfile({ projectId: project.id, billingProfileId: clientX }, admin.id)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('keep exactly one default', async () => {
    await org()
    const admin = await createUserWithRole('ADMIN')
    const first = await ensureDefaultBillingProfile()
    expect(await ensureDefaultBillingProfile()).toBe(first)
    const { id } = await createBillingProfile({ name: 'R&D' }, admin.id)
    await makeDefaultBillingProfile({ id })
    expect((await prisma.billingProfile.findMany({ where: { isDefault: true } })).map(p => p.id)).toEqual([id])
  })
})
