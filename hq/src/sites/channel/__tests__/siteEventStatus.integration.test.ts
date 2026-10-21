/**
 * `run.status` intake (siteEventHandler.ts) against the real test database:
 * what a status frame from the owning site does — the voice `done:` signal,
 * the session copy patch (only its writable fields), the activity entry, the
 * browser's status event — and the listeners every frame reaches.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { RunStatusEvent } from '@agenthix/core'
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

import { handleSiteEvent, onRunStatus, __resetForTests } from '../siteEventHandler'
import * as dashboardPush from '../../../test/fakes/debouncedPush'
import * as activityFeed from '../../../test/fakes/activity'
import { personalSession, projectSession, taskSession, sessionRow, statusEvent, installFakeIo, removeFakeIo, type FakeIo } from './siteEventFixtures'

let io: FakeIo

beforeEach(async () => {
  io = installFakeIo()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await personalSession('sess-1')
})

afterEach(() => {
  removeFakeIo()
  vi.restoreAllMocks()
  __resetForTests()
})

const recorded = () => activityFeed.recordActivity.mock.calls

describe('site event intake — run.status @SC-343', () => {
  it('COMPLETED patches the session copy, records activity, pushes a snapshot, emits status, and notifies listeners', async () => {
    const listener = vi.fn().mockResolvedValue(undefined)
    onRunStatus('completed-test', listener)

    const event = statusEvent({ status: 'COMPLETED', sessionPatch: { title: 'New title', totalInputTokens: 42 } })
    await handleSiteEvent('site-1', 'run.status', event)

    expect(await sessionRow('sess-1')).toMatchObject({ title: 'New title', totalInputTokens: 42 })
    // A person's own chat names no project.
    expect(recorded()).toEqual([['run_completed', '@bot completed run', 'run-1', undefined]])
    expect(dashboardPush.triggerSnapshotPush).toHaveBeenCalledTimes(1)
    expect(io.to).toHaveBeenCalledWith('session:sess-1')
    expect(io.emit).toHaveBeenCalledWith('agentRunStatus', { runId: 'run-1', status: 'COMPLETED', error: undefined })
    expect(listener).toHaveBeenCalledWith(event, 'site-1')
  })

  // R-108: the entry names the project the run happened in, so the dashboard
  // feed can hide it from someone who is not on that project.
  it("COMPLETED records the task's project on the run_completed entry", async () => {
    const { project } = await taskSession('sess-task')
    await handleSiteEvent('site-1', 'run.status', statusEvent({ sessionId: 'sess-task', status: 'COMPLETED' }))
    expect(recorded()).toEqual([['run_completed', '@bot completed run', 'run-1', project.id]])
  })

  it("COMPLETED records a project location's project, taken from the ownership lookup: one session read per frame, none extra", async () => {
    const session = await projectSession('sess-proj')
    const lookups = vi.spyOn(prisma.agentSession, 'findUnique')
    await handleSiteEvent('site-1', 'run.status', statusEvent({ sessionId: 'sess-proj', status: 'COMPLETED' }))
    expect(recorded()).toEqual([['run_completed', '@bot completed run', 'run-1', session.primaryOwnerId]])
    expect(lookups).toHaveBeenCalledTimes(1)
  })

  it("COMPLETED records no entry when the session's project cannot be resolved, rather than one everybody sees", async () => {
    await taskSession('sess-task')
    vi.spyOn(prisma.task, 'findUnique').mockRejectedValueOnce(new Error('db down'))
    await handleSiteEvent('site-1', 'run.status', statusEvent({ sessionId: 'sess-task', status: 'COMPLETED' }))
    expect(activityFeed.recordActivity).not.toHaveBeenCalled()
    expect(dashboardPush.triggerSnapshotPush).toHaveBeenCalledTimes(1)
  })

  it("passes the frame's originating siteId through to listeners, not a hardcoded one", async () => {
    const listener = vi.fn().mockResolvedValue(undefined)
    onRunStatus('site-id-threading-test', listener)

    const event = statusEvent({ status: 'RUNNING' })
    await handleSiteEvent('a-completely-different-site', 'run.status', event)

    expect(listener).toHaveBeenCalledWith(event, 'a-completely-different-site')
  })

  it.each([
    ['RUNNING', null],
    ['CANCELLED', null],
    ['FAILED', 'boom'],
  ] as const)('%s emits status, carrying its error, without recording activity or pushing a snapshot', async (status, error) => {
    await handleSiteEvent('site-1', 'run.status', statusEvent({ status, error }))
    expect(activityFeed.recordActivity).not.toHaveBeenCalled()
    expect(dashboardPush.triggerSnapshotPush).not.toHaveBeenCalled()
    expect(io.emit).toHaveBeenCalledWith('agentRunStatus', { runId: 'run-1', status, error: error ?? undefined })
  })

  it('writes nothing to the copy when sessionPatch is null', async () => {
    const before = await sessionRow('sess-1')
    await handleSiteEvent('site-1', 'run.status', statusEvent({ sessionPatch: null }))
    expect(await sessionRow('sess-1')).toEqual(before)
  })

  it('writes only the seven writable fields — a smuggled owner or a nested relation write is dropped', async () => {
    const intruder = await prisma.user.create({ data: {} })
    const before = await sessionRow('sess-1')
    const smuggled = {
      title: 'ok title', status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING',
      totalInputTokens: 1, totalOutputTokens: 2, totalCacheReadTokens: 3, totalCacheWriteTokens: 4,
      // Outside the declared shape, but exactly the network-controlled object the pick must defend against.
      userId: intruder.id,
      agentId: 'another-agent',
      metadata: { injected: true },
    } as unknown as NonNullable<RunStatusEvent['sessionPatch']>

    await handleSiteEvent('site-1', 'run.status', statusEvent({ sessionPatch: smuggled }))

    expect(await sessionRow('sess-1')).toEqual({
      ...before,
      title: 'ok title', status: 'CLOSED', closedReason: 'HARNESS_STATE_MISSING',
      totalInputTokens: 1, totalOutputTokens: 2, totalCacheReadTokens: 3, totalCacheWriteTokens: 4,
      updatedAt: expect.any(Date),
    })
  })

  it('catches a failed write (the copy is gone) and still runs listeners', async () => {
    // The owner is known from an earlier frame; the copy is removed before this one.
    await handleSiteEvent('site-1', 'run.status', statusEvent({ runId: 'run-0' }))
    await prisma.agentSession.delete({ where: { id: 'sess-1' } })
    const listener = vi.fn().mockResolvedValue(undefined)
    onRunStatus('rejection-test', listener)

    const event = statusEvent({ sessionPatch: { title: 'x', totalInputTokens: 5 } })
    await expect(handleSiteEvent('site-1', 'run.status', event)).resolves.toBeUndefined()
    expect(listener).toHaveBeenCalledWith(event, 'site-1')
  })

  it('catches a listener rejection without preventing a second listener from running', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('boom'))
    const succeeding = vi.fn().mockResolvedValue(undefined)
    onRunStatus('failing', failing)
    onRunStatus('succeeding', succeeding)

    await expect(handleSiteEvent('site-1', 'run.status', statusEvent())).resolves.toBeUndefined()
    expect(failing).toHaveBeenCalledTimes(1)
    expect(succeeding).toHaveBeenCalledTimes(1)
  })

  it('catches a synchronously-throwing listener the same way, without skipping the rest', async () => {
    const throwsSync = vi.fn(() => { throw new Error('sync boom') })
    const after = vi.fn().mockResolvedValue(undefined)
    onRunStatus('throws-sync', throwsSync as unknown as (e: RunStatusEvent) => Promise<void>)
    onRunStatus('after', after)

    await expect(handleSiteEvent('site-1', 'run.status', statusEvent())).resolves.toBeUndefined()
    expect(throwsSync).toHaveBeenCalledTimes(1)
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('re-registering the same listener name replaces rather than doubles the call', async () => {
    const first = vi.fn().mockResolvedValue(undefined)
    const second = vi.fn().mockResolvedValue(undefined)
    onRunStatus('same-name', first)
    onRunStatus('same-name', second)

    await handleSiteEvent('site-1', 'run.status', statusEvent())
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('site event intake — unknown event @SC-343', () => {
  it('logs and resolves without throwing', async () => {
    await expect(handleSiteEvent('site-1', 'something.else', {})).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })
})
