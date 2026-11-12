/**
 * A run's memory (ADR-0188; spec, Recall): the same search a turn makes, with the run's brief as the query, under
 * the run's person, agent and place; nothing for a run that is for no person; the deprecated pinned items only for a
 * site that reads nothing newer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const userRow = vi.hoisted(() => vi.fn())
const personalOwner = vi.hoisted(() => vi.fn())
const siteConn = vi.hoisted(() => vi.fn())

vi.mock('wasp/server', () => ({ prisma: { user: { findUnique: userRow } } }))
vi.mock('../../projects/personalProject', () => ({ personalOwnerOf: personalOwner }))
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: { get: siteConn } }))
vi.mock('../../conversations/memory/probe', () => ({ probe: vi.fn() }))

import type { RecalledItem } from '../contract'
import type { TurnProbe } from '../../conversations/memory/probe'
import { memoryForRun, pinnedForOlderSite, type RunFor, type RunMemoryDeps } from '../runMemory'

const recalled = (key: string, kind: RecalledItem['kind']): RecalledItem & { weighted: boolean } => ({
  itemId: `id-${key}`, key, title: key, body: `${key} body`, kind, tags: [], writtenAt: '', weighted: false,
})

const found: TurnProbe = {
  certain: [recalled('tables', 'RULE'), recalled('job', 'FACT')],
  probable: [{ itemId: 'id-host', key: 'host', title: 'Preferred host', similarity: 0.5 }],
  scores: new Map(),
}

function deps(over: Partial<RunMemoryDeps> = {}) {
  return { probe: vi.fn(async () => found), markRecalled: vi.fn(async () => {}), timeLimitMs: 1_000, ...over } satisfies RunMemoryDeps
}

const run = (over: Partial<RunFor> = {}): RunFor => ({
  agentId: 'ag', personId: 'p1', startedBy: 'person', boundary: { type: 'project', id: 'pr1' }, runnerPersonId: 'p1',
  brief: 'Compare the hosting options\nWe need a host for the shop', ...over,
})

beforeEach(() => {
  userRow.mockReset().mockResolvedValue({ deactivatedAt: null })
  personalOwner.mockReset().mockResolvedValue(null)
  siteConn.mockReset().mockReturnValue(null)
})

describe("a run's memory @SC-2106", () => {
  it('searches with the run\'s brief under its person, agent and place, and gives what it found, Rules first', async () => {
    const d = deps()
    expect(await memoryForRun(run(), d)).toEqual({
      items: [
        { key: 'tables', kind: 'rule', title: 'tables', body: 'tables body' },
        { key: 'job', kind: 'fact', title: 'job', body: 'job body' },
      ],
      hinted: [{ key: 'host', title: 'Preferred host' }],
    })
    expect(d.probe).toHaveBeenCalledWith({ personId: 'p1', agentId: 'ag', place: { type: 'project', id: 'pr1' } }, 'Compare the hosting options We need a host for the shop')
    expect(d.markRecalled).toHaveBeenCalledWith(['id-tables', 'id-job'], expect.any(Date))
  })

  it('reads a personal project as its person\'s own space', async () => {
    personalOwner.mockResolvedValue('p1')
    const d = deps()
    await memoryForRun(run(), d)
    expect(d.probe).toHaveBeenCalledWith(expect.objectContaining({ place: { type: 'user', id: 'p1' } }), expect.any(String))
  })

  it.each([
    ['a pulse', { startedBy: 'pulse' as const }],
    ['a schedule', { startedBy: 'schedule' as const }],
    ["a project's shared home", { runnerPersonId: null }],
    ["another person's home", { runnerPersonId: 'p2' }],
    ['no person', { personId: null }],
  ])('gives nothing to a run for %s', async (_what, over) => {
    const d = deps()
    expect(await memoryForRun(run(over), d)).toBeNull()
    expect(d.probe).not.toHaveBeenCalled()
  })

  it('treats a person who has left the organisation as no one', async () => {
    userRow.mockResolvedValue({ deactivatedAt: new Date() })
    const d = deps()
    expect(await memoryForRun(run(), d)).toBeNull()
    expect(d.probe).not.toHaveBeenCalled()
  })

  it('gives nothing without a brief, or when nothing was found', async () => {
    expect(await memoryForRun(run({ brief: '  ' }), deps())).toBeNull()
    expect(await memoryForRun(run(), deps({ probe: vi.fn(async () => ({ certain: [], probable: [], scores: new Map() })) }))).toBeNull()
  })

  it('starts the run without memory when the search fails or is slow', async () => {
    expect(await memoryForRun(run(), deps({ probe: vi.fn(async () => { throw new Error('embedder down') }) }))).toBeNull()
    expect(await memoryForRun(run(), deps({ probe: vi.fn(() => new Promise<TurnProbe>(() => {})), timeLimitMs: 10 }))).toBeNull()
  })
})

describe('the deprecated pinned items, for an older site @SC-2106', () => {
  const memory = { items: [{ key: 'tables', kind: 'rule', title: 'Tables', body: 'Use a table.' }], hinted: [] }

  it('are the items found in full, for a site before 1.19 only', () => {
    siteConn.mockReturnValue({ protocol: { major: 1, minor: 18 } })
    expect(pinnedForOlderSite('s1', memory)).toEqual([{ key: 'tables', scope: 'person', title: 'Tables', body: 'Use a table.' }])
    siteConn.mockReturnValue({ protocol: { major: 1, minor: 19 } })
    expect(pinnedForOlderSite('s1', memory)).toBeNull()
  })

  it('are nothing when there is no memory or the site is not connected', () => {
    siteConn.mockReturnValue({ protocol: { major: 1, minor: 18 } })
    expect(pinnedForOlderSite('s1', null)).toBeNull()
    siteConn.mockReturnValue(null)
    expect(pinnedForOlderSite('s1', memory)).toBeNull()
  })
})
