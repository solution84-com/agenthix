/**
 * A task run paused at the end of a step for a scheduled change (host-management spec §14), as its
 * end arrives from the site: the task waits for the change, in words, with its conversation marked so the run
 * after carries on where it stopped. When no change holds its site any more, it starts again at once.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runPausedReason } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createSession } from '../../test/factories'
import { addTask, agentInProject, frame, startsLanded, stateOf } from './taskRunFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))
const listeners = vi.hoisted(() => new Map<string, (e: unknown, siteId: string) => Promise<void>>())
vi.mock('../../sites/channel/siteEventHandler', () => ({
  onRunStatus: (name: string, l: (e: unknown, siteId: string) => Promise<void>) => listeners.set(name, l),
}))

import '../TaskRunner'
import { settledRunState } from '../taskStatusListener'
import { PAUSED_WAITING_REASON } from '../../sites/scheduled/runHold'
import * as dispatchFake from '../../test/fakes/dispatchService'

let seq = 0
const changes: string[] = []

async function pausedRunOnSite(withHold: boolean) {
  const site = await prisma.executionSite.create({ data: { siteId: `paused-site-${++seq}-${Date.now()}`, label: 'office-server', protocolVersion: '1.0' } })
  if (withHold) {
    const row = await prisma.scheduledChange.create({ data: {
      source: `site:${site.siteId}`, changeId: `c-${seq}`, siteId: site.siteId, kind: 'upgrade', at: new Date(Date.now() + 2 * 60_000),
      state: 'pausing', lastUpdate: 'pausing', machineName: 'office-server', sentAt: new Date(), pausedAt: new Date(), expectedMinutes: 20,
    } })
    changes.push(row.id)
  }
  const where = await agentInProject()
  const task = await addTask(where, { runState: 'RUN_ACTIVE', runId: 'run-p', runStartedBy: 'person' })
  dispatchFake.placeTask(task.id, site.siteId)
  const session = await createSession({ agentId: where.agent.id, taskId: task.id, sessionType: 'task', metadata: { agentId: where.agent.id } })
  const paused = frame(task.id, 'run-p', { status: 'CANCELLED', error: runPausedReason('the scheduled upgrade of office-server') })
  return { site, task, session, paused }
}

const marked = async (sessionId: string) =>
  ((await prisma.agentSession.findUniqueOrThrow({ where: { id: sessionId } })).metadata as Record<string, unknown>).pausedForScheduledChange === true

afterEach(async () => {
  await prisma.scheduledChange.deleteMany({ where: { id: { in: changes.splice(0) } } })
})

describe('a task run that paused for a scheduled change', () => {
  it('reads as waiting, not finished, stopped or blocked', () => {
    const e = frame('t', 'r', { status: 'CANCELLED', error: runPausedReason('the scheduled resize of lab') })
    expect(settledRunState(e)).toEqual({ runState: 'RUN_QUEUED', reason: PAUSED_WAITING_REASON })
    expect(settledRunState(frame('t', 'r', { status: 'CANCELLED', error: 'Stopped by the scheduled resize of lab' })).runState).toBe('RUN_NONE')
  })

  it('waits for the change holding its site, saying so, with its conversation marked to carry on', async () => {
    const { site, task, session, paused } = await pausedRunOnSite(true)
    await listeners.get('task-machine')!(paused, site.siteId)
    await startsLanded([task.id])

    const state = await stateOf(task.id)
    expect(state.runState).toBe('RUN_QUEUED')
    expect(state.runStateReason).toBe('Paused for scheduled maintenance: the upgrade of office-server. It carries on by itself when that is done.')
    expect(await marked(session.id)).toBe(true)
    expect(dispatchFake.dispatchedTaskRuns).toEqual([])
  })

  it('starts again at once when no change holds its site any more', async () => {
    const { site, task, session, paused } = await pausedRunOnSite(false)
    await listeners.get('task-machine')!(paused, site.siteId)
    await startsLanded([task.id])

    expect(await stateOf(task.id)).toMatchObject({ runState: 'RUN_ACTIVE' })
    expect(dispatchFake.dispatchedTaskRuns.map(r => r.taskId)).toEqual([task.id])
    expect(await marked(session.id)).toBe(true)
  })
})
