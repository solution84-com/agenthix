import { describe, it, expect, vi, beforeEach } from 'vitest'

// Runs live on the Execution Sites, so composeSnapshot reads them over the
// channel rather than from hq's own tables. The combined read that asks every
// site is stubbed here — how it treats a slow or absent site is its own
// suite's subject, and the cross-site summing is `snapshot.multisite.test.ts`.
// hq's own tables (sessions, agents, projects, tasks) still come from the raw
// PrismaClient param.

const mockAskEverySite = vi.hoisted(() => vi.fn())
// Kept for the skipped case below, which still names it, and so the real
// channel singleton is never pulled in behind the store import.

vi.mock('../../../sites/combinedRead', () => ({ askEverySite: mockAskEverySite }))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))

import { composeSnapshot } from '../snapshot'
import * as siteStore from '../../../test/fakes/siteRuntimeStore'

function mockPrismaFor(agentSessionRows: unknown[]) {
  return {
    siteConfig: { findFirst: vi.fn().mockResolvedValue({ siteId: 's1', name: 'Test Site', slug: 'test' }) },
    agent: {
      count: vi.fn().mockResolvedValue(3),
      findMany: vi.fn().mockResolvedValue([
        { id: 'a1', handle: 'k', name: 'Kernel', avatarUrl: null },
        { id: 'a2', handle: 'd', name: 'Designer', avatarUrl: null },
        { id: 'a3', handle: 'i', name: 'Idle', avatarUrl: null },
      ]),
    },
    project: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'p1', key: 'TEST-1', name: 'Test Project', description: null, updatedAt: new Date('2026-05-04T10:00:00Z'),
          boards: [{ id: 'b1' }, { id: 'b2' }],
          tasks: [{ status: 'DONE' }, { status: 'TODO' }],
        },
      ]),
    },
    task: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue([
        { status: 'DONE', runState: 'RUN_NONE' },
        { status: 'TODO', runState: 'RUN_NONE' },
      ]),
    },
    agentSession: {
      findMany: vi.fn().mockResolvedValue(agentSessionRows),
    },
  } as unknown as Parameters<typeof composeSnapshot>[0]
}

/** One site answering, the shape the channel returns. */
function oneSiteAnswers(value: unknown) {
  mockAskEverySite.mockResolvedValue({ answers: [{ siteId: 's1', value }], unanswered: [] })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAskEverySite.mockResolvedValue({ answers: [], unanswered: [] })
})

describe('composeSnapshot @SC-136', () => {
  it('returns a DashboardSnapshot with totals, financial, top agents, recent projects, recent activity', async () => {
    oneSiteAnswers({
      totalRuns: 3, completedRuns: 1, failedRuns: 1, runningRuns: 1, totalTokens: 1800,
      perAgent: [
        { agentId: 'a1', runCount: 2, totalTokens: 1500 },
        { agentId: 'a2', runCount: 1, totalTokens: 300 },
      ],
    })
    const mockPrisma = mockPrismaFor([
      { id: 'sess1', agentId: 'a1', status: 'ACTIVE' },
      { id: 'sess2', agentId: 'a2', status: 'ACTIVE' },
    ])

    const snap = await composeSnapshot(mockPrisma, 'u-viewer')

    expect(snap.siteId).toBe('s1')
    expect(snap.totals).toEqual({ agents: 3, projects: 2, tasks: 2, activeSessions: 2 })
    expect(snap.runs).toEqual({ total: 3, completed: 1, failed: 1, running: 1 })
    expect(snap.financial.totalTokens).toBe(1800)
    expect(snap.financial.estimatedCost).toBeGreaterThan(0)
    expect(snap.recentProjects).toHaveLength(1)
    expect(snap.recentProjects[0].name).toBe('Test Project')
    expect(snap.recentProjects[0].boardCount).toBe(2)
    expect(snap.recentProjects[0].doneTaskCount).toBe(1)
    expect(snap.topAgents.find((a: { id: string }) => a.id === 'a1')?.activeSessionCount).toBe(1)
    expect(snap.taskCounts.done).toBe(1)
    expect(snap.taskCounts.idle).toBe(1)
    expect(snap.unanswered).toEqual([])
  })

  // An unreachable or unregistered site never silently zeroes the dashboard —
  // the sites that could not be asked are named, so "no runs" and "cannot ask"
  // stay apart.
  it('degrades to an empty run set and names the site it could not ask', async () => {
    mockAskEverySite.mockResolvedValue({
      answers: [],
      unanswered: [{ siteId: 's1', label: 'Local Site', reason: 'offline', detail: 'Local Site is not connected to hq.' }],
    })
    const mockPrisma = mockPrismaFor([])

    const snap = await composeSnapshot(mockPrisma, 'u-viewer')

    expect(snap.runs).toEqual({ total: 0, completed: 0, failed: 0, running: 0 })
    expect(snap.financial.totalTokens).toBe(0)
    expect(snap.unanswered).toEqual([
      { siteId: 's1', label: 'Local Site', reason: 'offline', detail: 'Local Site is not connected to hq.' },
    ])
  })

  it('an organisation with no site at all still gets its snapshot', async () => {
    const mockPrisma = mockPrismaFor([])

    const snap = await composeSnapshot(mockPrisma, 'u-viewer')

    expect(snap.runs).toEqual({ total: 0, completed: 0, failed: 0, running: 0 })
    expect(snap.unanswered).toEqual([])
    expect(snap.totals.agents).toBe(3)
  })

  // SKIPPED, not changed. composeSnapshot no longer sees a site's failure at
  // all: the combined read it now makes never rejects because a site failed,
  // by design — one site's fault must not take the whole dashboard down. This
  // case asserts the behaviour that change removed on purpose. Its assertions
  // and title are untouched: the scenario it sits under describes the
  // snapshot's own contents and does not itself claim what this asserts, so
  // whether the contract should say anything here is the QA audit's decision,
  // not a thing to quietly rewrite. The property itself did not disappear — it
  // moved down to where the failure is now classified, and is covered by
  // `hq/src/sites/__tests__/combinedRead.test.ts`, which pins an
  // arbitrary throw becoming an `error` silence rather than being swallowed.
  it.skip('does not swallow a non-SiteUnreachableError failure from the store', async () => {
    siteStore.runStats.mockRejectedValue(new Error('boom'))
    const mockPrisma = mockPrismaFor([])

    await expect(composeSnapshot(mockPrisma, 'u-viewer')).rejects.toThrow('boom')
  })
})
