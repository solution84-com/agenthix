/**
 * Task and board operations over the control plane (@SC-308, @SC-309), against
 * the real test database: an unattended run is confined to its own project,
 * the acting agent is always the capability's, a run on behalf of the project's
 * Viewer cannot archive or delete, and a person's connection acts as its person, never as an
 * agent. (Membership rules for chat runs and connections: taskEntitlement.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpError } from 'wasp/server'
import { prisma } from '../../../test/db'
import { createProject, createTestTask } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
// Wrapped, not replaced, so two tests can stage a failure inside the real createTask.
vi.mock('../../../projects/projectService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../projects/projectService')>()
  return { ...actual, createTask: vi.fn(actual.createTask) }
})

import * as taskOps from '../taskOps'
import * as boardOps from '../boardOps'
import { ensureBuiltInTaskTypes } from '../../../projects/taskTypes'
import { ControlPlaneError } from '../types'
import { createTask } from '../../../projects/projectService'
import * as taskRunnerFake from '../../../test/fakes/TaskRunner'
import { seedWorld, chatCtx, runCtx, connCtx, expectForbidden, setProjectRole, type World } from './controlPlaneFixtures'

let w: World
let foreign: { id: string }
beforeEach(async () => {
  w = await seedWorld()
  foreign = await createProject({ accessLevel: 'OPEN' })
})

const own = () => runCtx(w.project.id)
const elsewhere = () => runCtx(foreign.id)
const taskRow = () => prisma.task.findUniqueOrThrow({ where: { id: w.task.id } })

describe('a run in a project is confined to it', () => {
  it('get_task_details: refused for a foreign project, served for its own', async () => {
    await expectForbidden(taskOps.getTaskDetailsOp(elsewhere(), { taskId: w.task.id }))
    await expect(taskOps.getTaskDetailsOp(own(), { taskId: w.task.id })).resolves.toMatchObject({ taskId: w.task.id, projectId: w.project.id })
  })

  it('update_task: refused for a foreign project (unchanged), applied for its own', async () => {
    await expectForbidden(taskOps.updateTaskOp(elsewhere(), { taskId: w.task.id, title: 'x' }))
    expect((await taskRow()).title).toBe('T')
    await expect(taskOps.updateTaskOp(own(), { taskId: w.task.id, title: 'New title' })).resolves.toMatchObject({ success: true, taskId: w.task.id })
    expect((await taskRow()).title).toBe('New title')
  })

  it('has no update_task_state: an agent never sets a run state (spec §6)', () => {
    expect('updateTaskStateOp' in taskOps).toBe(false)
  })

  it('add_comment: refused for a foreign project, writing nothing', async () => {
    await expectForbidden(taskOps.addCommentOp(elsewhere(), { taskId: w.task.id, content: 'hi' }))
    expect(await prisma.taskComment.count()).toBe(0)
  })

  it('run_task: refused for a foreign project, running nothing', async () => {
    await expectForbidden(taskOps.runTaskOp(elsewhere(), { taskId: w.task.id }))
    expect(taskRunnerFake.taskRunner.runTask).not.toHaveBeenCalled()
  })
})

describe('get_board project confinement', () => {
  it('refuses an unattended caller for a board in a foreign project, and serves it for its own', async () => {
    await expectForbidden(boardOps.getBoardOp(elsewhere(), { projectId: w.project.id, kind: 'STATE' }))
    await expect(boardOps.getBoardOp(own(), { projectId: w.project.id, kind: 'STATE' })).resolves.toMatchObject({ board: { kind: 'STATE' } })
  })

  it("reads a saved board of a foreign project as none, even named with the caller's own project", async () => {
    const saved = await prisma.board.create({ data: { name: 'Theirs', projectId: foreign.id, view: 'STATE' } })
    await expect(boardOps.getBoardOp(own(), { projectId: w.project.id, boardId: saved.id })).rejects.toMatchObject({ code: 'not_found' })
    await expectForbidden(boardOps.getBoardOp(own(), { projectId: foreign.id, boardId: saved.id }))
  })

  // Skipped as before, not changed: a chat caller now needs membership of the
  // project it reaches (ADR-0062), and these assert the behaviour that removed on
  // purpose. Whether the contract should now say membership is the QA audit's call.
  it.skip('passes a chat caller for a board in a foreign project', async () => {
    await expect(boardOps.getBoardOp(chatCtx(w.member.id, 'MEMBER', { projectId: w.project.id }), { projectId: foreign.id, kind: 'STATE' }))
      .resolves.toMatchObject({ board: { kind: 'STATE' } })
  })
})

describe('create_task / create_board / list_boards refuse a foreign projectId', () => {
  it('refuses create_task in a foreign project, and with a foreign project\'s type, creating nothing', async () => {
    await expectForbidden(taskOps.createTaskOp(own(), { title: 't', projectId: foreign.id }))
    const foreignType = (await ensureBuiltInTaskTypes(foreign.id)).TASK
    await expect(taskOps.createTaskOp(own(), { title: 't', projectId: w.project.id, typeId: foreignType })).rejects.toBeTruthy()
    expect(await prisma.task.count()).toBe(1)
  })

  it("creates a task in the caller's own project, on behalf of the task's person", async () => {
    const run = runCtx(w.project.id, { taskId: w.task.id })
    const result = await taskOps.createTaskOp(run, { title: 't', projectId: w.project.id }) as { taskId: string }
    expect(result).toMatchObject({ success: true })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: result.taskId } }))
      .toMatchObject({ projectId: w.project.id, state: 'BACKLOG', onBehalfOfUserId: w.member.id })
  })

  it('translates an HttpError(400) from creating the task into a ControlPlaneError(invalid), message preserved', async () => {
    vi.mocked(createTask).mockRejectedValueOnce(new HttpError(400, 'synthetic validation failure'))
    const err = await taskOps.createTaskOp(runCtx(w.project.id, { taskId: w.task.id }), { title: 't', projectId: w.project.id }).catch((e) => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err).toMatchObject({ code: 'invalid', message: 'synthetic validation failure' })
  })

  it('propagates any other failure from creating the task uncaught', async () => {
    vi.mocked(createTask).mockRejectedValueOnce(new Error('db connection reset'))
    const err = await taskOps.createTaskOp(runCtx(w.project.id, { taskId: w.task.id }), { title: 't', projectId: w.project.id }).catch((e) => e)
    expect(err).not.toBeInstanceOf(ControlPlaneError)
    expect(err.message).toBe('db connection reset')
  })

  it('refuses create_board in a foreign project, creating nothing', async () => {
    await expectForbidden(boardOps.createBoardOp(own(), { projectId: foreign.id, name: 'B', kind: 'STATE' }))
    expect(await prisma.board.count()).toBe(1)
  })

  it('refuses list_boards for an explicit foreign projectId', async () => {
    await expectForbidden(boardOps.listBoardsOp(own(), { projectId: foreign.id }))
  })
})

describe('the listings read one project, which a run confined to one must name as its own', () => {
  it('list_tasks refuses a foreign projectId, and lists its own project\'s tasks', async () => {
    await expectForbidden(taskOps.listTasksOp(own(), { projectId: foreign.id }))
    await createTestTask({ data: { title: 'f', projectId: foreign.id, number: 1, onBehalfOfUserId: 'x' } })
    const listed = await taskOps.listTasksOp(own(), { projectId: w.project.id })
    expect(listed.tasks.map((t) => t.taskId)).toEqual([w.task.id])
  })

  it('a run whose claims name no project is refused', async () => {
    await expectForbidden(taskOps.listTasksOp(runCtx(null), { projectId: w.project.id }))
    await expectForbidden(boardOps.listBoardsOp(runCtx(null), { projectId: w.project.id }))
  })

  it('a call that names no project is refused, rather than listing across projects', async () => {
    await expect(taskOps.listTasksOp(own(), {} as never)).rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('identity pinning (SC-309)', () => {
  it('add_comment writes as the capability\'s agent even when args name another', async () => {
    await prisma.agent.create({ data: { id: 'agent-argued', name: 'Other', handle: 'agent-argued' } })
    await taskOps.addCommentOp(own(), { taskId: w.task.id, agentId: 'agent-argued', content: 'hi' })
    expect(await prisma.taskComment.findFirstOrThrow()).toMatchObject({ taskId: w.task.id, agentId: 'agent-1', content: 'hi' })
  })

  it("fetch_my_queued_tasks reads the capability's agent's queue even when args name another", async () => {
    await prisma.task.update({ where: { id: w.task.id }, data: { state: 'TODO' } })
    await prisma.agent.create({ data: { id: 'agent-argued', name: 'Other', handle: 'agent-argued' } })
    const result = await taskOps.fetchMyQueuedTasksOp(chatCtx(w.member.id, 'ADMIN'), { agentId: 'agent-argued' })
    expect(result.tasks.map((t) => t.taskId)).toEqual([w.task.id])
  })
})

describe("archive_task / delete_task refuse a run on behalf of the project's Viewer (spec §H5, adr-0101, adr-0102)", () => {
  it.each([
    ['archive_task', () => taskOps.archiveTaskOp(chatCtx(w.member.id), { taskId: w.task.id })],
    ['delete_task', () => taskOps.deleteTaskOp(chatCtx(w.member.id), { taskId: w.task.id })],
    ['archive_task, from the task\'s own run', () => taskOps.archiveTaskOp(own(), { taskId: w.task.id })],
  ])('refuses %s for a Viewer of the project, saying so, and changes nothing', async (_name, call) => {
    await setProjectRole(w.project.id, w.member.id, 'VIEWER')
    const err = await expectForbidden(call())
    expect(err.message).toContain('Viewer')
    expect(await taskRow()).toMatchObject({ archived: false })
  })

  it.skip('passes a MEMBER chat caller on archive_task even for a foreign project', async () => {
    await taskOps.archiveTaskOp(chatCtx(w.outsider.id, 'MEMBER', { projectId: foreign.id }), { taskId: w.task.id })
    expect((await taskRow()).archived).toBe(true)
  })

  it.skip('passes a MEMBER chat caller on delete_task even for a foreign project', async () => {
    await taskOps.deleteTaskOp(chatCtx(w.outsider.id, 'MEMBER', { projectId: foreign.id }), { taskId: w.task.id })
    expect(await prisma.task.count()).toBe(0)
  })

  it.skip('get_task_details passes MEMBER chat claims for a foreign project (reads carry no chatRoleFloor)', async () => {
    await expect(taskOps.getTaskDetailsOp(chatCtx(w.outsider.id, 'MEMBER', { projectId: foreign.id }), { taskId: w.task.id }))
      .resolves.toMatchObject({ taskId: w.task.id })
  })
})

describe("a person's connection (adr-0090) — its person, never an agent", () => {
  // An org admin's own connection, acting in an open project it is a member of (adr-0099).
  let openTask: { id: string }
  beforeEach(async () => {
    await prisma.projectMember.create({ data: { projectId: foreign.id, userId: w.outsider.id } })
    openTask = await createTestTask({ data: { title: 'O', projectId: foreign.id, number: 1, onBehalfOfUserId: 'x' } })
  })
  const admin = () => connCtx(w.outsider.id, { role: 'ADMIN', connectionId: 'conn-1' })

  it('get_task_details passes in a project its person reaches', async () => {
    await expect(taskOps.getTaskDetailsOp(admin(), { taskId: openTask.id })).resolves.toMatchObject({ taskId: openTask.id })
  })

  it('get_task_details returns every comment, oldest first, without the approval markers (every-screen-reviewed spec §9) @SC-522', async () => {
    await prisma.taskComment.createMany({
      data: [
        { taskId: openTask.id, authorType: 'USER', userId: w.member.id, content: 'Use the staging bucket.', createdAt: new Date('2026-10-07T09:00:00Z') },
        { taskId: openTask.id, authorType: 'AGENT', agentId: 'agent-1', content: '__MANIFEST_APPROVAL__:{}', createdAt: new Date('2026-10-07T09:01:00Z') },
        { taskId: openTask.id, authorType: 'AGENT', agentId: 'agent-1', content: 'Done step 1.', createdAt: new Date('2026-10-07T09:02:00Z') },
      ],
    })
    await expect(taskOps.getTaskDetailsOp(admin(), { taskId: openTask.id })).resolves.toMatchObject({
      comments: [
        { author: w.member.id.slice(0, 8), authorType: 'USER', at: '2026-10-07T09:00:00.000Z', text: 'Use the staging bucket.' },
        { author: '@agent-1', authorType: 'AGENT', at: '2026-10-07T09:02:00.000Z', text: 'Done step 1.' },
      ],
    })
  })

  it("run_task starts the task on the connection's person's behalf", async () => {
    await prisma.task.update({ where: { id: openTask.id }, data: { runState: 'RUN_QUEUED', assignedAgentId: 'agent-1' } })
    await taskOps.runTaskOp(admin(), { taskId: openTask.id })
    expect(taskRunnerFake.startedTasks).toEqual([expect.objectContaining({ taskId: openTask.id, startedBy: 'person', personId: w.outsider.id })])
  })

  it("get_task_details is refused in an open project its person has not joined — an org admin's included", async () => {
    await prisma.projectMember.deleteMany({ where: { projectId: foreign.id, userId: w.outsider.id } })
    await expectForbidden(taskOps.getTaskDetailsOp(admin(), { taskId: openTask.id }))
  })

  it("get_task_details is refused in a private project its person is not on — an org admin's included", async () => {
    await expectForbidden(taskOps.getTaskDetailsOp(admin(), { taskId: w.task.id }))
  })

  it("create_task is refused where its person has no access, and creates nothing", async () => {
    await expectForbidden(taskOps.createTaskOp(admin(), { title: 't', projectId: w.project.id }))
    expect(await prisma.task.count()).toBe(2)
  })

  it('add_comment writes as its person and ignores an agentId it names', async () => {
    await taskOps.addCommentOp(admin(), { taskId: openTask.id, agentId: 'agent-1', content: 'hi' })
    expect(await prisma.taskComment.findFirstOrThrow()).toMatchObject({
      taskId: openTask.id, authorType: 'USER', userId: w.outsider.id, connectionId: 'conn-1', content: 'hi', agentId: null,
    })
  })

  it('archive_task passes in a project its person reaches', async () => {
    await taskOps.archiveTaskOp(admin(), { taskId: openTask.id })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: openTask.id } })).archived).toBe(true)
  })
})
