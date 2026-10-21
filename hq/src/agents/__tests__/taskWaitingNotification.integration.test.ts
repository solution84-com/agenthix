/**
 * A task that starts needing its person notifies them (every screen reviewed
 * spec §6, §9; adr-0089), against the real database: a run stopped at its limit
 * leaves the task "Needs you" and tells the person it runs on behalf of, once,
 * with an action that opens the task. A tool request is already told by its
 * approval notification, and a person who lost access is not told at all.
 */
import { describe, it, expect, vi } from 'vitest'
import { DEFAULT_RUN_LIMITS, runLimitReason } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createUser } from '../../test/factories'
import { addTask, agentInProject, frame, settle } from './taskRunFixtures'

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
import { notifyTaskWaiting, TASK_WAITING_NOTIFICATION_TYPE } from '../taskWaitingNotification'
import { LOST_ACCESS_REASON } from '../../projects/taskOnBehalfOf'
import * as dispatchFake from '../../test/fakes/dispatchService'

const listen = (e: unknown) => listeners.get('task-machine')!(e, dispatchFake.DEFAULT_SITE_ID)
const LIMIT = runLimitReason('time', DEFAULT_RUN_LIMITS)
const waitingNotes = (userId: string) =>
  prisma.notification.findMany({ where: { userId, type: TASK_WAITING_NOTIFICATION_TYPE } })

async function runningTask() {
  const where = await agentInProject({ key: 'WEB' })
  const task = await addTask(where, { title: 'Ship it', number: 7, runState: 'RUN_ACTIVE', runId: 'run-1' })
  return { ...where, task }
}

describe('a run stopped at its limit @SC-528', () => {
  it('tells the person the task runs on behalf of, with an action that opens it', async () => {
    const { task, person } = await runningTask()

    await listen(frame(task.id, 'run-1', { status: 'CANCELLED', error: LIMIT }))
    await settle()

    expect(await waitingNotes(person.id)).toEqual([expect.objectContaining({
      title: 'WEB-7 needs you',
      body: `"Ship it" is waiting for you. ${LIMIT}`,
      actionLabel: 'Open the task',
      actionUrl: '/tasks/WEB-7',
      status: 'unread',
    })])
  })

  it('tells them once, however many frames report it', async () => {
    const { task, person } = await runningTask()
    await listen(frame(task.id, 'run-1', { status: 'CANCELLED', error: LIMIT }))
    await listen(frame(task.id, 'run-1', { status: 'CANCELLED', error: LIMIT }))
    await settle()
    expect(await waitingNotes(person.id)).toHaveLength(1)
  })
})

describe('runs that end without needing the person @SC-528', () => {
  it.each([
    ['finishes', { status: 'COMPLETED' }],
    ['fails', { status: 'FAILED', error: 'boom' }],
    ['is stopped by a person', { status: 'CANCELLED', error: null }],
  ] as const)('a run that %s tells nobody', async (_label, over) => {
    const { task } = await runningTask()
    await listen(frame(task.id, 'run-1', over))
    await settle()
    expect(await prisma.notification.count({ where: { type: TASK_WAITING_NOTIFICATION_TYPE } })).toBe(0)
  })

  it('a tool request is told only by its approval notification', async () => {
    const { task, agent, person } = await runningTask()
    const pending = { runId: 'run-1', summary: 'needs web_fetch', pendingManifest: { tools: [] } }
    await listen(frame(task.id, 'run-1', { agentId: agent.id, manifestPending: pending } as never))
    await settle()
    expect(await waitingNotes(person.id)).toEqual([])
    expect(await prisma.notification.count({ where: { userId: person.id } })).toBe(1)
  })
})

describe('notifyTaskWaiting @SC-528', () => {
  it('does not tell a person again while an unread notice of the same task stands', async () => {
    const { task, person } = await runningTask()
    await notifyTaskWaiting(task.id, LIMIT)
    await notifyTaskWaiting(task.id, LIMIT)
    expect(await waitingNotes(person.id)).toHaveLength(1)
  })

  it('tells them again once the earlier notice was read: the task needs them again', async () => {
    const { task, person } = await runningTask()
    await notifyTaskWaiting(task.id, LIMIT)
    await prisma.notification.updateMany({ where: { userId: person.id }, data: { status: 'read' } })
    await notifyTaskWaiting(task.id, LIMIT)
    expect(await waitingNotes(person.id)).toHaveLength(2)
  })

  it('tells the person who started the run, not the task\'s person, when someone else started it (adr-0095)', async () => {
    const { task, person } = await runningTask()
    const ana = await createUser()
    await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: ana.id } })
    await notifyTaskWaiting(task.id, LIMIT)
    expect(await waitingNotes(ana.id)).toHaveLength(1)
    expect(await waitingNotes(person.id)).toHaveLength(0)
  })

  it('tells nobody when the task is blocked because its person lost access', async () => {
    const { task } = await runningTask()
    await notifyTaskWaiting(task.id, LOST_ACCESS_REASON)
    expect(await prisma.notification.count()).toBe(0)
  })

  it('tells nobody when the person has been removed', async () => {
    const { task } = await runningTask()
    await prisma.task.update({ where: { id: task.id }, data: { onBehalfOfUserId: 'removed-person' } })
    await notifyTaskWaiting(task.id, LIMIT)
    expect(await prisma.notification.count()).toBe(0)
  })

  it('never throws: the task is blocked either way', async () => {
    const { task } = await runningTask()
    const create = vi.spyOn(prisma.notification, 'create').mockRejectedValueOnce(new Error('db down'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(notifyTaskWaiting(task.id, LIMIT)).resolves.toBeUndefined()
    } finally {
      create.mockRestore()
      errorLog.mockRestore()
    }
  })
})
