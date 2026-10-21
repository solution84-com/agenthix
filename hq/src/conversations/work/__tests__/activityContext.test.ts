import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../sessions/siteRuntimeStore', () => ({ getRun: vi.fn(), getSession: vi.fn() }))

import { contextUseByOperation, workerContextUse, type ContextRow, type SiteReads } from '../activityContext'
import { toActivityView, type ActivityRow } from '../activityLines'

const use = (tokens: number) => ({ tokens, summarisesAt: 150_000, window: 200_000, at: '2026-10-17T10:00:00.000Z' })

const row = (over: Partial<ContextRow> = {}): ContextRow => ({
  id: 'o1', kind: 'WORKER', state: 'RUNNING', siteId: 's1', runId: 'r1', workerSessionId: 'w1', ...over,
})

function reads(run: unknown, session: unknown): SiteReads & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    getRun: async (_s, id) => { calls.push(`run:${id}`); return { contextUse: run as never } },
    getSession: async (_s, id) => { calls.push(`session:${id}`); return { contextUse: session as never } },
  }
}

describe('workerContextUse @SC-972', () => {
  it("takes the run's figure, else its session's, and ignores what is not one", () => {
    expect(workerContextUse({ contextUse: use(10) }, { contextUse: use(20) })).toEqual(use(10))
    expect(workerContextUse({ contextUse: null }, { contextUse: use(20) })).toEqual(use(20))
    expect(workerContextUse({ contextUse: { tokens: 'x' } as never }, null)).toBeNull()
  })
})

describe('contextUseByOperation @SC-972', () => {
  it("reads a running worker's figure from its run", async () => {
    const site = reads(use(90_000), use(1))
    expect(await contextUseByOperation([row()], site)).toEqual(new Map([['o1', use(90_000)]]))
    expect(site.calls).toEqual(['run:r1'])
  })

  it("falls back to the worker session's while the run has written none", async () => {
    const site = reads(null, use(40_000))
    expect((await contextUseByOperation([row()], site)).get('o1')).toEqual(use(40_000))
  })

  it('reads nothing for ended work, work with no run yet, or work that is not a worker', async () => {
    const site = reads(use(1), use(1))
    const rows = [row({ id: 'a', state: 'COMPLETED' }), row({ id: 'b', runId: null }), row({ id: 'c', kind: 'TASK' })]
    expect((await contextUseByOperation(rows, site)).size).toBe(0)
    expect(site.calls).toEqual([])
  })

  it('leaves the row without it when the site cannot be read', async () => {
    const site: SiteReads = { getRun: async () => { throw new Error('unreachable') }, getSession: async () => null }
    expect((await contextUseByOperation([row()], site)).size).toBe(0)
  })
})

describe('the activity view @SC-972', () => {
  const view = (over: Partial<ActivityRow>) => toActivityView({
    id: 'o1', kind: 'WORKER', state: 'RUNNING', title: 't', boundaryName: null, lines: [], endedHelpers: 0,
    createdAt: new Date('2026-10-17T10:00:00Z'), ...over,
  }, true)

  it('carries the context use while the work is under way, and none once it ended', () => {
    expect(view({ contextUse: use(5) }).contextUse).toEqual(use(5))
    expect(view({ state: 'COMPLETED', contextUse: use(5) }).contextUse).toBeNull()
    expect(view({}).contextUse).toBeNull()
  })
})
