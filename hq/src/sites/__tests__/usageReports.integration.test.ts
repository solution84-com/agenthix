/**
 * A site's usage reports against the real test database: authenticated by the site's machine credential, kept once
 * per call id, every held call id answered, and each new report fed to the provider's health.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UsageReport } from '@agenthix/core'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
const outcomes = vi.hoisted(() => [] as Array<{ providerId: string; outcome: unknown }>)
vi.mock('../../providers/health', () => ({
  reportOutcome: vi.fn(async (providerId: string, outcome: unknown) => { outcomes.push({ providerId, outcome }) }),
}))

import { usageReportHandler } from '../usageReports'
import { hashCredential } from '../credentials'

const CREDENTIAL = 'smc_usage_test_credential'
const HEADERS = { authorization: `Bearer ${CREDENTIAL}`, 'x-site-id': 'site-u' }

const report = (n: number, over: Partial<UsageReport> = {}): UsageReport => ({
  callId: `call-0000000${n}`, runId: 'run-1', providerId: 'prov-1', model: 'claude-sonnet-5', at: '2026-10-23T10:00:00.000Z',
  usage: { inputTokens: 10 * n, outputTokens: n, cacheReadTokens: 0, cacheWriteTokens: 0 }, upstreamStatus: 200, ...over,
})

function response() {
  // `any`: the handler answers several JSON shapes, which the tests read field by field.
  const r = { code: 200, body: undefined as any, status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b; return r } }
  return r
}
async function post(body: unknown, headers: Record<string, string> = HEADERS) {
  const r = response()
  await (usageReportHandler as unknown as (req: unknown, res: unknown, ctx: unknown) => Promise<void>)({ headers, body }, r, {})
  return r
}

beforeEach(async () => {
  outcomes.length = 0
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await prisma.executionSite.create({ data: { siteId: 'site-u', label: 'Usage', status: 'CONNECTED', credentialHash: hashCredential(CREDENTIAL) } })
})

describe('POST /api/v1/usage/report', () => {
  it('refuses a caller without the site\'s machine credential, keeping nothing', async () => {
    expect((await post({ reports: [report(1)] }, { authorization: 'Bearer wrong', 'x-site-id': 'site-u' })).code).toBe(401)
    expect((await post({ reports: [report(1)] }, {})).code).toBe(401)
    expect(await prisma.relayUsageReport.count()).toBe(0)
  })

  it('keeps each call once, and answers every call id it holds, those it already had included', async () => {
    const first = await post({ reports: [report(1), report(2)] })
    expect(first.body.acknowledged.sort()).toEqual(['call-00000001', 'call-00000002'])
    const again = await post({ reports: [report(2), report(3)] })
    expect(again.body.acknowledged.sort()).toEqual(['call-00000002', 'call-00000003'])
    const rows = await prisma.relayUsageReport.findMany({ orderBy: { callId: 'asc' } })
    expect(rows.map(r => [r.callId, r.siteId, r.inputTokens, r.hasUsage])).toEqual([
      ['call-00000001', 'site-u', 10, true], ['call-00000002', 'site-u', 20, true], ['call-00000003', 'site-u', 30, true],
    ])
  })

  it('keeps a call whose answer carried no usage, marked so the ledger writes it unpriced', async () => {
    await post({ reports: [report(4, { usage: null })] })
    expect(await prisma.relayUsageReport.findUnique({ where: { callId: 'call-00000004' } })).toMatchObject({ hasUsage: false, inputTokens: 0 })
  })

  it("feeds each new call's outcome to the provider's health, once", async () => {
    await post({ reports: [report(1), report(2, { upstreamStatus: 401, errorKind: 'auth', usage: null })] })
    await post({ reports: [report(2, { upstreamStatus: 401, errorKind: 'auth', usage: null })] })
    expect(outcomes).toEqual([
      { providerId: 'prov-1', outcome: { ok: true } },
      { providerId: 'prov-1', outcome: { ok: false, kind: 'auth', detail: 'Upstream status 401' } },
    ])
  })

  it('leaves out a report it cannot read, and refuses a batch over the limit', async () => {
    const r = await post({ reports: [report(1), { ...report(2), callId: 'no' }] })
    expect(r.body.acknowledged).toEqual(['call-00000001'])
    expect((await post({ reports: Array.from({ length: 201 }, (_, i) => report(i)) })).code).toBe(400)
  })
})
