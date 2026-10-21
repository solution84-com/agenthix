/**
 * A start time to come is never started early (agents own schedule spec §3)
 * against Postgres: the owner's walkthrough. A task is created in an
 * auto-queue column (queued at once), then given a start time ahead; a pulse
 * tick must not start it, and at its time the schedule starts it once. Only the
 * site is stood in for. Written by lane L; run by the lead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma: testDbPrisma } = await import('../../test/db')
  class HttpError extends Error {
    constructor(public statusCode: number, message?: string) { super(message) }
  }
  return { prisma: testDbPrisma, HttpError }
})

vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../sites/activeRunTracker', () => ({ registerActiveRunTracker: vi.fn() }))
vi.mock('../../sites/channel/siteEventHandler', () => ({ onRunStatus: vi.fn() }))

import { firePulsesDue } from '../pulse'
import { startSchedulesDue } from '../scheduledStart'
import { setTaskSchedule, clearTaskSchedule } from '../taskSchedule'
import { loadOrgAutomation } from '../automationStore'
import { createTask } from '../../projects/taskService'
import { originByPerson } from '../../projects/taskOnBehalfOf'
import * as dispatchFake from '../../test/fakes/dispatchService'

const COLUMNS = [
  { name: 'ready', label: 'Ready', status: 'TODO', order: 0, color: 'x', autoQueue: true },
  { name: 'done', label: 'Done', status: 'DONE', order: 1, color: 'x' },
]
const settle = () => new Promise(r => setTimeout(r, 20))
let runs = 0

async function world() {
  const person = await createUser()
  const project = await createProject({ accessLevel: 'OPEN' })
  const agent = await createAgent()
  const board = await prisma.board.create({ data: { name: 'Board', projectId: project.id, columns: COLUMNS } as never })
  await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true, pulseDueAt: new Date(0) } })
  const task = await createTask({
    title: 'Review', projectId: project.id, boardId: board.id, column: 'ready', assignedAgentId: agent.id,
    origin: originByPerson(person.id),
  })
  return { person, task }
}

const row = async (id: string) => (await prisma.task.findUnique({ where: { id } }))!
const starts = (taskId: string) => prisma.automationStart.findMany({ where: { started: { array_contains: [{ taskId }] } } })

beforeEach(() => {
  runs = 0
  vi.clearAllMocks()
  dispatchFake.resolveSiteIdForTask.mockResolvedValue('site-1')
  dispatchFake.dispatchTaskRun.mockImplementation(async (taskId: string) => ({ runId: `run-${++runs}-${taskId}`, sessionId: 's' }))
})

describe('a start time given to a task its column already queued', () => {
  it('withdraws the queued run; a pulse tick does not start it; at its time the schedule starts it once', async () => {
    const { person, task } = await world()
    expect((await row(task.id)).runState).toBe('RUN_QUEUED')

    // Start times fall on the minute, so the test's own time does.
    const at = new Date(Math.ceil((Date.now() + 120_000) / 60_000) * 60_000)
    await setTaskSchedule(task.id, { at: at.toISOString() }, { kind: 'person', userId: person.id })
    expect(await row(task.id)).toMatchObject({ runState: 'RUN_NONE', runStartedBy: null })

    const org = await loadOrgAutomation()
    await firePulsesDue(org, new Date())
    await settle()
    expect((await row(task.id)).runState).toBe('RUN_NONE')
    expect(dispatchFake.dispatchTaskRun).not.toHaveBeenCalled()

    const atItsTime = new Date(at.getTime() + 5_000)
    await startSchedulesDue(org, atItsTime)
    await startSchedulesDue(org, atItsTime)
    await settle()
    expect(dispatchFake.dispatchTaskRun).toHaveBeenCalledTimes(1)
    expect((await row(task.id)).runState).toBe('RUN_ACTIVE')
    expect(await starts(task.id)).toHaveLength(1)
  })

  it('a queued task that kept a time to come, however it got there, is never started by the pulse', async () => {
    const { task } = await world()
    await prisma.task.update({ where: { id: task.id }, data: { scheduleNextDueAt: new Date(Date.now() + 600_000) } })
    await firePulsesDue(await loadOrgAutomation(), new Date())
    await settle()
    expect(dispatchFake.dispatchTaskRun).not.toHaveBeenCalled()
    expect((await row(task.id)).runState).toBe('RUN_QUEUED')
  })

  it('clearing the start time puts the task back in its column, which queues it', async () => {
    const { person, task } = await world()
    await setTaskSchedule(task.id, { at: new Date(Date.now() + 120_000).toISOString() }, { kind: 'person', userId: person.id })
    await clearTaskSchedule(task.id)
    expect(await row(task.id)).toMatchObject({ runState: 'RUN_QUEUED', scheduleNextDueAt: null })
  })
})
