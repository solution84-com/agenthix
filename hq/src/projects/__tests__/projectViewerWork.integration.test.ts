/**
 * adr-0102: whether someone may work in a project is their role there. A
 * project Viewer reads it and changes nothing — no task, board, plan, comment,
 * run, stop, clear or delete — whatever their organisation role; a Member and
 * an Admin of the project may do all of it. Against the real test DB. The
 * project is open, so what varies below is the role in the project alone.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createAgent, createUser, createUserWithRole, joinProjectAs } from '../../test/factories'
import { ctx, makeBoard, makeTask, assignAgent, projectState } from './projectsHarness'

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
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import {
  createTask, updateTask, moveTaskToColumn, unarchiveTask, addTaskComment,
  archiveTask, deleteTask, runTask, stopTask, dismissTaskRun,
} from '../actions'
import { startAgentInProject, startAllAgents, stopAgentInProject } from '../agentLineOperations'
import { moveTaskToBoard } from '../boardOperations'
import { saveBoardView } from '../boardViewOperations'
import { createMilestone, updateTaskPlan } from '../planOperations'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'

type ProjectRole = 'ADMIN' | 'MEMBER' | 'VIEWER'

/** An open project the caller is on with `role`, two saved boards, an assigned agent, and an idle task in To do. */
async function openCast(role: ProjectRole, taskData: Record<string, unknown> = {}, orgRole: 'ADMIN' | 'MEMBER' = 'MEMBER') {
  const caller = await createUserWithRole(orgRole)
  const project = await createProject({ accessLevel: 'OPEN' })
  await joinProjectAs(project.id, caller.id, role)
  const agent = await createAgent()
  await assignAgent(project.id, agent.id)
  const board = await makeBoard(project.id)
  const other = await makeBoard(project.id)
  const task = await makeTask(project.id, { state: 'TODO', ...taskData })
  return { caller, project, agent, board, other, task }
}
type Cast = Awaited<ReturnType<typeof openCast>>
// A Wasp operation answers its output or a promise of it.
type Case = [string, (c: Cast) => unknown, Record<string, unknown>?]

const writes: Case[] = [
  ['createTask', (c) => createTask({ projectId: c.project.id, title: 'x' }, ctx(c.caller))],
  ['createTask with an assigned agent', (c) => createTask({ projectId: c.project.id, title: 'x', assignedAgentId: c.agent.id }, ctx(c.caller))],
  ['updateTask on plain fields', (c) => updateTask({ taskId: c.task.id, title: 'renamed' }, ctx(c.caller))],
  ['updateTask assigning an agent', (c) => updateTask({ taskId: c.task.id, assignedAgentId: c.agent.id }, ctx(c.caller))],
  // An epic has no agent, so the task made an epic has none.
  ['updateTaskPlan', (c) => updateTaskPlan({ taskId: c.task.id, isEpic: true }, ctx(c.caller)), { assignedAgentId: null }],
  ['moveTaskToColumn into Done', (c) => moveTaskToColumn({ taskId: c.task.id, column: 'done' }, ctx(c.caller))],
  ['moveTaskToColumn into In progress', (c) => moveTaskToColumn({ taskId: c.task.id, column: 'in_progress' }, ctx(c.caller))],
  ['moveTaskToColumn into Backlog', (c) => moveTaskToColumn({ taskId: c.task.id, column: null }, ctx(c.caller))],
  ['moveTaskToBoard', (c) => moveTaskToBoard({ taskId: c.task.id, boardId: c.other.id }, ctx(c.caller))],
  ['addTaskComment', (c) => addTaskComment({ taskId: c.task.id, content: 'hello' }, ctx(c.caller))],
  ['saveBoardView', (c) => saveBoardView({ projectId: c.project.id, name: 'New', kind: 'STATE' }, ctx(c.caller))],
  ['createMilestone', (c) => createMilestone({ projectId: c.project.id, name: 'M', date: '2026-12-01' }, ctx(c.caller))],
  ['unarchiveTask', (c) => unarchiveTask({ taskId: c.task.id }, ctx(c.caller))],
  ['archiveTask', (c) => archiveTask({ taskId: c.task.id }, ctx(c.caller))],
  ['deleteTask', (c) => deleteTask({ taskId: c.task.id }, ctx(c.caller))],
  ['stopTask', (c) => stopTask({ taskId: c.task.id }, ctx(c.caller)), { runState: 'RUN_QUEUED' }],
  ['dismissTaskRun', (c) => dismissTaskRun({ taskId: c.task.id }, ctx(c.caller)), { runState: 'RUN_FAILED' }],
  ['runTask', (c) => runTask({ taskId: c.task.id }, ctx(c.caller)), { runState: 'RUN_NONE' }],
  ['startAgentInProject', (c) => startAgentInProject({ projectId: c.project.id, agentId: c.agent.id, taskIds: [c.task.id] }, ctx(c.caller)), { runState: 'RUN_NONE', state: 'TODO' }],
  ['startAllAgents', (c) => startAllAgents({ projectId: c.project.id, taskIds: [c.task.id] }, ctx(c.caller)), { runState: 'RUN_NONE', state: 'TODO' }],
  ['stopAgentInProject', (c) => stopAgentInProject({ projectId: c.project.id, agentId: c.agent.id }, ctx(c.caller)), { runState: 'RUN_QUEUED', runStartedBy: 'person' }],
]

async function castFor(role: ProjectRole, taskData: Record<string, unknown> | undefined, orgRole?: 'ADMIN' | 'MEMBER') {
  const cast = await openCast(role, {}, orgRole)
  // The task is made with its agent, so a run may start; a state is given where the call needs one.
  await prisma.task.update({ where: { id: cast.task.id }, data: { assignedAgentId: cast.agent.id, ...(taskData ?? {}) } as any })
  return cast
}

describe.each(writes)('%s changes the project @SC-625', (_name, call, taskData) => {
  it('refuses its Viewer with 403 saying so, and changes and starts nothing', async () => {
    const cast = await castFor('VIEWER', taskData)
    const before = await projectState()
    await expect(Promise.resolve(call(cast))).rejects.toMatchObject({
      statusCode: 403, message: expect.stringContaining('A Viewer reads this project and changes nothing'),
    })
    expect(await projectState()).toEqual(before)
    expect(taskRunnerFake.startedTasks).toEqual([])
  })

  it("refuses its Viewer who is the organisation's admin: no organisation role grants work in a project", async () => {
    const cast = await castFor('VIEWER', taskData, 'ADMIN')
    await expect(Promise.resolve(call(cast))).rejects.toMatchObject({ statusCode: 403 })
  })

  it.each(['MEMBER', 'ADMIN'] as const)('lets its %s through', async (role) => {
    const cast = await castFor(role, taskData)
    await expect(Promise.resolve(call(cast))).resolves.not.toBeInstanceOf(Error)
  })
})

describe('a project Member whose organisation has no settings row for them still works there @SC-625', () => {
  it('runs a task: the organisation role is not read', async () => {
    const caller = await createUser()
    const project = await createProject({ accessLevel: 'OPEN' })
    await joinProjectAs(project.id, caller.id, 'MEMBER')
    const agent = await createAgent()
    await assignAgent(project.id, agent.id)
    const task = await makeTask(project.id, { assignedAgentId: agent.id })
    await runTask({ taskId: task.id }, ctx(caller))
    expect(taskRunnerFake.startedTasks.at(-1)).toMatchObject({ taskId: task.id, agent: { id: agent.id } })
  })
})
