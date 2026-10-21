/**
 * The task page's Run, Stop and Dismiss (SC-034, SC-408, spec §6, adr-0089),
 * against the real test DB. Run queues a run from none pending, or over a failed
 * or blocked one, and starts it; Stop cancels a run going and leaves the task
 * idle; Dismiss clears a failed or blocked run. Dismiss and Run again replace a
 * tool request the last run left unanswered. A block for lost access is
 * released only by reassigning. The site and the task runner are the shared
 * fakes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createSession, createUser, createUserWithRole, joinProjectAs } from '../../test/factories'
import { taskActionUrl } from '../../notifications/notificationKinds'
import { ctx, makeBoard, makeTask } from './projectsHarness'

const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { runTask, stopTask, dismissTaskRun } from '../actions'
import { LOST_ACCESS_REASON } from '../taskOnBehalfOf'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'
beforeEach(() => socket.emitTaskUpdated.mockClear())

async function cast(runState = 'RUN_NONE', extra: Record<string, unknown> = {}) {
  const operator = await createUserWithRole('MEMBER')
  const agent = await createAgent()
  const project = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: operator.id } })
  const board = await makeBoard(project.id)
  const task = await makeTask(project.id, { boardId: board.id, assignedAgentId: agent.id, runState, ...extra })
  return { operator, agent, project, board, task }
}
const fresh = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })

describe('Run @SC-034', () => {
  it.each(['RUN_NONE', 'RUN_FAILED', 'RUN_BLOCKED'])('from %s, queues a run asked for by the person, tells the board, and starts it', async (runState) => {
    const { operator, agent, board, task } = await cast(runState, { runStateReason: runState === 'RUN_NONE' ? null : 'why' })

    await runTask({ taskId: task.id }, ctx(operator))

    expect(await fresh(task.id)).toMatchObject({ runState: 'RUN_QUEUED', runStartedBy: 'person', queuedByUserId: operator.id, queueDepth: 0 })
    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: task.id, agent: expect.objectContaining({ id: agent.id }) })])
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })

  it.each(['RUN_QUEUED', 'RUN_THROTTLED', 'RUN_ACTIVE'])('refuses with 409, starting nothing, when a run is already %s', async (runState) => {
    const { operator, task } = await cast(runState)
    await expect(runTask({ taskId: task.id }, ctx(operator))).rejects.toMatchObject({ statusCode: 409 })
    expect(taskRunnerFake.startedTasks).toEqual([])
  })

  it('refuses a block for lost access with 409, queueing and starting nothing: only reassigning releases it', async () => {
    const { operator, task } = await cast('RUN_BLOCKED', { runStateReason: LOST_ACCESS_REASON })
    await expect(runTask({ taskId: task.id }, ctx(operator))).rejects.toMatchObject({ statusCode: 409 })
    expect((await fresh(task.id)).runState).toBe('RUN_BLOCKED')
    expect(taskRunnerFake.startedTasks).toEqual([])
  })

  it('refuses a task with no assigned agent (400), and a caller who is not signed in', async () => {
    const { operator, task } = await cast()
    await prisma.task.update({ where: { id: task.id }, data: { assignedAgentId: null } })
    await expect(runTask({ taskId: task.id }, ctx(operator))).rejects.toMatchObject({ statusCode: 400 })
    await expect(runTask({ taskId: task.id }, ctx(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(taskRunnerFake.startedTasks).toEqual([])
  })
})

describe('Stop @SC-408', () => {
  it('cancels every active run of the task on its site and leaves the task idle — idle before the first cancel', async () => {
    const { operator, task } = await cast('RUN_ACTIVE', { runStateReason: 'execution slot available' })
    siteStore.addRun(SITE, { id: 'run-1', taskId: task.id, status: 'RUNNING' })
    siteStore.addRun(SITE, { id: 'run-2', taskId: task.id, status: 'PENDING' })
    siteStore.addRun(SITE, { id: 'run-other', taskId: 'another', status: 'RUNNING' })
    let atFirstCancel: string | undefined
    siteStore.cancelRun.mockImplementationOnce(async (siteId, runId) => {
      atFirstCancel = (await fresh(task.id)).runState
      const run = await siteStore.getRun(siteId, runId)
      if (run) run.status = 'CANCELLED'
    })

    await expect(stopTask({ taskId: task.id }, ctx(operator))).resolves.toEqual({ cancelled: 2 })

    expect(atFirstCancel).toBe('RUN_NONE')
    expect(await fresh(task.id)).toMatchObject({ runState: 'RUN_NONE', runStateReason: null })
    expect((await siteStore.getRun(SITE, 'run-other'))?.status).toBe('RUNNING')
  })

  it('a queued task is set idle without asking any site, and reports zero', async () => {
    const { operator, task } = await cast('RUN_QUEUED', { runStateReason: 'queued by user' })
    siteStore.makeSiteUnreachable(SITE)
    await expect(stopTask({ taskId: task.id }, ctx(operator))).resolves.toEqual({ cancelled: 0 })
    expect((await fresh(task.id)).runState).toBe('RUN_NONE')
  })

  it('a running task whose site has no active run reports zero and is idle', async () => {
    const { operator, task } = await cast('RUN_ACTIVE')
    await expect(stopTask({ taskId: task.id }, ctx(operator))).resolves.toEqual({ cancelled: 0 })
    expect((await fresh(task.id)).runState).toBe('RUN_NONE')
  })

  it("an unreachable site's error reaches the person with its text, and the task is put back as it was, not left idle over a live run", async () => {
    const { operator, task } = await cast('RUN_ACTIVE', { runStateReason: 'execution slot available' })
    siteStore.makeSiteUnreachable(SITE, new Error("Execution Site 'Office' is unreachable"))
    await expect(stopTask({ taskId: task.id }, ctx(operator))).rejects.toThrow("Execution Site 'Office' is unreachable")
    expect(await fresh(task.id)).toMatchObject({ runState: 'RUN_ACTIVE', runStateReason: 'execution slot available' })
  })

  it.each(['RUN_FAILED', 'RUN_BLOCKED', 'RUN_NONE'])('a %s task has nothing to stop: left as it is (Run or Dismiss clears a failed or blocked run)', async (runState) => {
    const { operator, task } = await cast(runState, { runStateReason: 'why' })
    await expect(stopTask({ taskId: task.id }, ctx(operator))).resolves.toEqual({ cancelled: 0 })
    expect(await fresh(task.id)).toMatchObject({ runState, runStateReason: 'why' })
  })

  it("refuses the project's Viewer saying so, a caller outside a private project, and one not signed in — changing nothing", async () => {
    const { task, project } = await cast('RUN_ACTIVE')
    siteStore.addRun(SITE, { id: 'run-1', taskId: task.id, status: 'RUNNING' })
    const viewer = await createUserWithRole('MEMBER')
    await joinProjectAs(project.id, viewer.id, 'VIEWER')
    await expect(stopTask({ taskId: task.id }, ctx(viewer))).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Viewer') })
    await prisma.project.update({ where: { id: project.id }, data: { accessLevel: 'PRIVATE' } })
    await expect(stopTask({ taskId: task.id }, ctx(await createUserWithRole('MEMBER')))).rejects.toMatchObject({ statusCode: 403 })
    await expect(stopTask({ taskId: task.id }, ctx(null))).rejects.toMatchObject({ statusCode: 401 })
    expect((await fresh(task.id)).runState).toBe('RUN_ACTIVE')
    expect(siteStore.cancelledRuns).toEqual([])
  })
})

describe('Dismiss', () => {
  it.each([['RUN_FAILED', 'it failed'], ['RUN_BLOCKED', 'Awaiting tool approval']])('clears a %s run back to none pending, and tells the board', async (runState, reason) => {
    const { operator, board, task } = await cast(runState, { runStateReason: reason })
    await dismissTaskRun({ taskId: task.id }, ctx(operator))
    expect(await fresh(task.id)).toMatchObject({ runState: 'RUN_NONE', runStateReason: null })
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
    expect(taskRunnerFake.startedTasks).toEqual([])
  })

  it.each([['RUN_NONE', null], ['RUN_QUEUED', null], ['RUN_BLOCKED', LOST_ACCESS_REASON]])('says so with 409 when there is nothing it may dismiss (%s), and tells no board', async (runState, reason) => {
    const { operator, task } = await cast(runState, { runStateReason: reason })
    await expect(dismissTaskRun({ taskId: task.id }, ctx(operator))).rejects.toMatchObject({ statusCode: 409 })
    expect((await fresh(task.id)).runState).toBe(runState)
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
  })

  it("needs Run's permission and membership of the task's project, changing nothing otherwise", async () => {
    const { project, task } = await cast('RUN_FAILED')
    const viewer = await createUserWithRole('MEMBER')
    await joinProjectAs(project.id, viewer.id, 'VIEWER')
    await expect(dismissTaskRun({ taskId: task.id }, ctx(viewer))).rejects.toMatchObject({ statusCode: 403 })
    await prisma.project.update({ where: { id: project.id }, data: { accessLevel: 'PRIVATE' } })
    await expect(dismissTaskRun({ taskId: task.id }, ctx(await createUserWithRole('MEMBER')))).rejects.toMatchObject({ statusCode: 403 })
    await expect(dismissTaskRun({ taskId: task.id }, ctx(await createUser()))).rejects.toMatchObject({ statusCode: 403 })
    expect((await fresh(task.id)).runState).toBe('RUN_FAILED')
  })
})

describe('Dismiss and Run again replace a request the last run left unanswered (spec §9) @SC-643', () => {
  async function asking() {
    const made = await cast('RUN_BLOCKED', { runStateReason: 'Awaiting tool approval' })
    const session = await createSession({ userId: made.operator.id, agentId: made.agent.id, sessionType: 'task', taskId: made.task.id })
    const request = siteStore.addRun(SITE, { id: `asked-${made.task.id}`, sessionId: session.id, taskId: made.task.id, status: 'COMPLETED', manifestStatus: 'PENDING_APPROVAL' })
    const note = await prisma.notification.create({
      data: {
        userId: made.operator.id, type: 'tool_approval', title: 't', body: 'b', status: 'unread',
        actionUrl: taskActionUrl(`${made.project.key}-${made.task.number}`),
      },
    })
    return { ...made, request, note }
  }
  const statusOf = async (id: string) => (await prisma.notification.findUniqueOrThrow({ where: { id } })).status

  it('Dismiss marks the request replaced on the site and its notification handled', async () => {
    const { operator, task, request, note } = await asking()
    await dismissTaskRun({ taskId: task.id }, ctx(operator))
    expect(request.manifestStatus).toBe('SUPERSEDED')
    expect(await statusOf(note.id)).toBe('handled')
  })

  it('Run again does too, before its run starts', async () => {
    const { operator, task, request, note } = await asking()
    await runTask({ taskId: task.id }, ctx(operator))
    expect(request.manifestStatus).toBe('SUPERSEDED')
    expect(await statusOf(note.id)).toBe('handled')
    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: task.id })])
  })
})
