/**
 * Two rules of `run.status` intake (siteEventHandler.ts) that decide whether a
 * frame may change hq's copy, against the real test database:
 *
 * - the terminal-frame latch: a second terminal frame for a run (the deferred
 *   manifest report, a stale reconcile frame) runs no side effect again, while
 *   the status listeners still get every frame; and
 * - a site's title is a compare-and-set on the placeholder title (R-057), so a
 *   person's rename is never undone by a frame already in flight.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../../server/dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
// The real task runner registers itself on this handler as it loads, which would
// load it in the middle of loading the handler; it is not what these tests are about.
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import {
  handleSiteEvent, onRunStatus, __resetForTests, TERMINAL_LATCH_MAX_AGE_MS, TERMINAL_LATCH_HARD_CAP,
} from '../siteEventHandler'
import * as dashboardPush from '../../../test/fakes/debouncedPush'
import * as activityFeed from '../../../test/fakes/activity'
import { personalSession, sessionRow, statusEvent, installFakeIo, removeFakeIo, type FakeIo } from './siteEventFixtures'

let io: FakeIo
// The run's own status to its session's room; the person's runs:changed event goes out beside it.
const statusEmits = () => io.emit.mock.calls.filter((c) => c[0] === 'agentRunStatus')

beforeEach(async () => {
  io = installFakeIo()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await personalSession('sess-1')
})

afterEach(() => {
  removeFakeIo()
  vi.restoreAllMocks()
  vi.useRealTimers()
  __resetForTests()
})

const tokens = async () => (await sessionRow('sess-1')).totalInputTokens
/** A terminal frame whose session patch says which frame wrote it. */
const completed = (runId: string, n: number) => statusEvent({ runId, status: 'COMPLETED', sessionPatch: { totalInputTokens: n } })

describe('run.status terminal-frame latch @SC-343', () => {
  it('a duplicate terminal frame for the same runId: side effects run once, listeners run for every frame', async () => {
    const listener = vi.fn().mockResolvedValue(undefined)
    onRunStatus('latch-test', listener)

    const first = statusEvent({ status: 'COMPLETED', sessionPatch: { totalInputTokens: 1 } })
    const second = statusEvent({ status: 'COMPLETED', sessionPatch: { totalInputTokens: 2 }, manifestPending: { runId: 'run-1', summary: null, pendingManifest: { tools: [], bashPatterns: [] } } })

    await handleSiteEvent('site-1', 'run.status', first)
    await handleSiteEvent('site-1', 'run.status', second)

    // Side effects: exactly once, from the FIRST frame.
    expect(await tokens()).toBe(1)
    expect(activityFeed.recordActivity).toHaveBeenCalledTimes(1)
    expect(dashboardPush.triggerSnapshotPush).toHaveBeenCalledTimes(1)
    expect(statusEmits()).toHaveLength(1)

    // Listeners: once per frame — the second frame's whole reason to exist
    // (manifestPending) still reaches the listener.
    expect(listener.mock.calls).toEqual([[first, 'site-1'], [second, 'site-1']])
  })

  it('a RUNNING frame arriving after a terminal one for the same runId: no side effects, listener still runs (stale reconcile)', async () => {
    const listener = vi.fn().mockResolvedValue(undefined)
    onRunStatus('reconcile-test', listener)
    await handleSiteEvent('site-1', 'run.status', completed('run-1', 1))
    io.emit.mockClear()

    const stale = statusEvent({ status: 'RUNNING', sessionPatch: { totalInputTokens: 9, title: 'stale' } })
    await handleSiteEvent('site-1', 'run.status', stale)

    expect(await sessionRow('sess-1')).toMatchObject({ totalInputTokens: 1, title: 'New Conversation' })
    expect(statusEmits()).toHaveLength(0)
    expect(listener).toHaveBeenLastCalledWith(stale, 'site-1')
  })

  it("a terminal frame for a DIFFERENT runId is unaffected by another runId's latch", async () => {
    await handleSiteEvent('site-1', 'run.status', completed('run-1', 1))
    await handleSiteEvent('site-1', 'run.status', completed('run-2', 2))

    expect(await tokens()).toBe(2)
    expect(statusEmits().at(-1)).toEqual(['agentRunStatus', { runId: 'run-2', status: 'COMPLETED', error: undefined }])
  })

  it('prunes entries older than TERMINAL_LATCH_MAX_AGE_MS on the next insert', async () => {
    // Only the clock the latch reads; the database driver keeps real timers.
    vi.useFakeTimers({ toFake: ['Date'] })
    await handleSiteEvent('site-1', 'run.status', completed('old-run', 1))

    vi.advanceTimersByTime(TERMINAL_LATCH_MAX_AGE_MS + 1_000)

    // A fresh terminal frame triggers the prune; the aged-out entry no longer
    // latches 'old-run', so a second COMPLETED for it runs side effects again.
    await handleSiteEvent('site-1', 'run.status', completed('trigger-prune', 2))
    await handleSiteEvent('site-1', 'run.status', completed('old-run', 3))
    expect(await tokens()).toBe(3)
  })

  it('hard-caps at TERMINAL_LATCH_HARD_CAP, evicting oldest-first', async () => {
    // One more than the cap, so exactly the single oldest entry ('run-0') is evicted.
    for (let i = 0; i <= TERMINAL_LATCH_HARD_CAP; i++) {
      await handleSiteEvent('site-1', 'run.status', statusEvent({ runId: `run-${i}`, status: 'COMPLETED' }))
    }

    // 'run-1' first: it is still latched, so this frame changes nothing and does
    // not touch the map. 'run-0' first would re-latch it and evict 'run-1'.
    await handleSiteEvent('site-1', 'run.status', completed('run-1', 1))
    expect(await tokens()).toBe(0)

    // 'run-0' was evicted, so a second terminal frame for it applies again.
    await handleSiteEvent('site-1', 'run.status', completed('run-0', 2))
    expect(await tokens()).toBe(2)
  }, 60_000)
})

// R-057: a site names a session once; a person's rename must never be undone by
// a frame that was already in flight (a deferred run's final frame is sent well
// after the title was read).
describe('a site-generated title is a compare-and-set on the placeholder title', () => {
  const titled = (title: string, extra: Record<string, number> = {}) =>
    statusEvent({ status: 'COMPLETED', sessionPatch: { title, ...extra } })

  it('writes the title where the copy still holds "New Conversation"', async () => {
    await handleSiteEvent('site-1', 'run.status', titled('Billing dashboard'))
    expect((await sessionRow('sess-1')).title).toBe('Billing dashboard')
  })

  it('a stale title for a copy a person already renamed changes nothing, and the frame is still processed', async () => {
    await prisma.agentSession.update({ where: { id: 'sess-1' }, data: { title: 'My own name' } })
    const listener = vi.fn().mockResolvedValue(undefined)
    onRunStatus('stale-title-test', listener)

    const event = titled('Billing dashboard')
    await handleSiteEvent('site-1', 'run.status', event)

    expect((await sessionRow('sess-1')).title).toBe('My own name')
    expect(io.emit).toHaveBeenCalledWith('agentRunStatus', { runId: 'run-1', status: 'COMPLETED', error: undefined })
    expect(listener).toHaveBeenCalledWith(event, 'site-1')
  })

  it('a title-only patch makes no unconditional update of the copy', async () => {
    const update = vi.spyOn(prisma.agentSession, 'update')
    await handleSiteEvent('site-1', 'run.status', statusEvent({ sessionPatch: { title: 'Billing dashboard' } }))
    expect(update).not.toHaveBeenCalled()
  })

  it('a patch with no title leaves the title alone, and its other fields are still applied', async () => {
    await handleSiteEvent('site-1', 'run.status', statusEvent({ status: 'COMPLETED', sessionPatch: { totalInputTokens: 7 } }))
    expect(await sessionRow('sess-1')).toMatchObject({ title: 'New Conversation', totalInputTokens: 7 })
  })

  it('an empty title is not written', async () => {
    await handleSiteEvent('site-1', 'run.status', statusEvent({ sessionPatch: { title: '' } }))
    expect((await sessionRow('sess-1')).title).toBe('New Conversation')
  })

  it('a failed token-totals write does not stop the title from being applied', async () => {
    vi.spyOn(prisma.agentSession, 'update').mockRejectedValueOnce(new Error('write failed'))
    await handleSiteEvent('site-1', 'run.status', statusEvent({ sessionPatch: { title: 'Billing dashboard', totalInputTokens: 7 } }))
    expect(await sessionRow('sess-1')).toMatchObject({ title: 'Billing dashboard', totalInputTokens: 0 })
  })
})
