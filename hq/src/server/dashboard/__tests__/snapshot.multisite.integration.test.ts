import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunStatsResult, SiteSilence } from '@agenthix/core'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../../test/db'

// The snapshot's run figures belong to no single site: they are the sum of
// every site that answered. `askEverySite` is stubbed here because what it
// does with a slow or absent site is its own suite's subject — what matters at
// this level is that the snapshot sums the answers, merges the per-agent rows
// by agent rather than concatenating them, and carries the silences out so the
// page can say whose runs are missing. hq's own reads run against the real
// test database, holding two agents.
const mockAskEverySite = vi.hoisted(() => vi.fn())

vi.mock('../../../sites/combinedRead', () => ({ askEverySite: mockAskEverySite }))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../activity', () => import('../../../test/fakes/activity'))

import { composeSnapshot } from '../snapshot'
import * as siteStore from '../../../test/fakes/siteRuntimeStore'

const stats = (over: Partial<RunStatsResult> = {}): RunStatsResult => ({
  totalRuns: 0, completedRuns: 0, failedRuns: 0, runningRuns: 0, totalTokens: 0, perAgent: [], ...over,
})

const offline = (siteId: string, label: string): SiteSilence => ({
  siteId, label, reason: 'offline', detail: `${label} is not connected to hq.`,
})

beforeEach(async () => {
  vi.clearAllMocks()
  await prisma.agent.createMany({ data: [{ id: 'x', handle: 'x', name: 'Crosscut' }, { id: 'y', handle: 'y', name: 'Yardstick' }] })
  mockAskEverySite.mockResolvedValue({ answers: [], unanswered: [] })
})

describe('the dashboard snapshot sums every site that answered', () => {
  it('sums the run statistics of every site that answered', async () => {
    mockAskEverySite.mockResolvedValue({
      answers: [
        { siteId: 'a', value: stats({ totalRuns: 3, completedRuns: 2, failedRuns: 1, runningRuns: 0, totalTokens: 100 }) },
        { siteId: 'b', value: stats({ totalRuns: 4, completedRuns: 4, failedRuns: 0, runningRuns: 1, totalTokens: 50 }) },
      ],
      unanswered: [],
    })

    const snap = await composeSnapshot(prisma as never, 'u1')

    expect(snap.runs).toEqual({ total: 7, completed: 6, failed: 1, running: 1 })
    expect(snap.financial.totalTokens).toBe(150)
  })

  it('merges the per-agent breakdown across sites rather than listing the agent twice', async () => {
    mockAskEverySite.mockResolvedValue({
      answers: [
        { siteId: 'a', value: stats({ totalRuns: 3, totalTokens: 100, perAgent: [{ agentId: 'x', runCount: 3, totalTokens: 100 }] }) },
        { siteId: 'b', value: stats({ totalRuns: 4, totalTokens: 50, perAgent: [{ agentId: 'x', runCount: 4, totalTokens: 50 }] }) },
      ],
      unanswered: [],
    })

    const snap = await composeSnapshot(prisma as never, 'u1')

    // One agent, one row, whole totals. Concatenating would rank two halves of
    // the same agent against everybody else's whole.
    expect(snap.topAgents.filter((a) => a.id === 'x')).toHaveLength(1)
    expect(snap.topAgents.find((a) => a.id === 'x')).toMatchObject({ tokens: 150, runCount: 7 })
  })

  it('shows the totals it has and names the site that is missing from them', async () => {
    mockAskEverySite.mockResolvedValue({
      answers: [{ siteId: 'a', value: stats({ totalRuns: 3, totalTokens: 100 }) }],
      unanswered: [offline('b', 'Laptop')],
    })

    const snap = await composeSnapshot(prisma as never, 'u1')

    expect(snap.runs.total).toBe(3)
    expect(snap.unanswered).toEqual([offline('b', 'Laptop')])
  })

  it('says nothing answered rather than showing zero as a fact', async () => {
    mockAskEverySite.mockResolvedValue({ answers: [], unanswered: [offline('b', 'Laptop')] })

    const snap = await composeSnapshot(prisma as never, 'u1')

    // The figures are zero and the list says why — "no runs" and "cannot ask"
    // must never look the same. The rest of the snapshot still renders: one
    // sleeping laptop does not take the dashboard away from the organisation.
    expect(snap.runs).toEqual({ total: 0, completed: 0, failed: 0, running: 0 })
    expect(snap.unanswered).toHaveLength(1)
    expect(snap.totals.agents).toBe(2)
  })

  it('an organisation whose every site answered is told so with an empty list', async () => {
    mockAskEverySite.mockResolvedValue({ answers: [{ siteId: 'a', value: stats() }], unanswered: [] })

    const snap = await composeSnapshot(prisma as never, 'u1')

    expect(snap.unanswered).toEqual([])
  })

  it('asks each site by the id the channel keys connections by', async () => {
    mockAskEverySite.mockImplementation(async (call: (s: unknown) => Promise<RunStatsResult>) => ({
      answers: [
        { siteId: 'site-a', value: await call({ id: 'es-a', siteId: 'site-a', label: 'A', status: 'ONLINE', protocolVersion: SITE_PROTOCOL_VERSION }) },
      ],
      unanswered: [],
    }))
    siteStore.runStats.mockResolvedValue(stats({ totalRuns: 1 }))

    const snap = await composeSnapshot(prisma as never, 'u1')

    expect(siteStore.runStats).toHaveBeenCalledWith('site-a')
    expect(snap.runs.total).toBe(1)
  })
})
