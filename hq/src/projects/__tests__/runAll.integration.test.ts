import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask } from '../../test/factories'

// runProject / runBoard dispatch behaviour against the real test DB (ADR-0035).
// These actions query candidate tasks/agents through `context.entities` (backed
// here by the real test-DB delegates) and dispatch each via taskRunner, which is
// a side-effecting collaborator and so is mocked. `wasp/server`'s prisma is the
// same real test-DB client `../../test/db` exports — runProject/runBoard now
// also carry the project-membership check (spec §6.4), which reads through the
// module-level prisma rather than context.entities, so it needs real rows too.
// Membership is the only gate (adr-0099), so each project these tests create
// gets the caller, u1, as a member.

vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('wasp/server', async () => {
  const { HttpError } = await vi.importActual<any>('wasp/server')
  const { prisma: testDbPrisma } = await import('../../test/db')
  return { HttpError, prisma: testDbPrisma }
})

import { runProject, runBoard } from '../actions'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'

let n = 0
const uniq = (p: string) => `${p}_${Date.now().toString(36)}_${n++}`

async function createProjectRow() {
  const project = await createProject({ name: 'P', key: `RA${(n++).toString().padStart(2, '0')}`.slice(0, 6) })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: 'u1' } })
  return project
}
function createAgentRow() {
  return prisma.agent.create({ data: { name: 'A', handle: uniq('agent') } as any })
}
async function createTaskRow(projectId: string, data: Record<string, unknown> = {}) {
  const agg = await prisma.task.aggregate({ where: { projectId }, _max: { number: true } })
  return createTestTask({ data: { title: 'T', projectId, number: (agg._max.number ?? 0) + 1, onBehalfOfUserId: 'u1', ...data } as any })
}

function ctx() {
  return {
    user: { id: 'u1' },
    entities: { Task: prisma.task, Agent: prisma.agent },
  } as any
}

// Starting a run needs someone who works in the project (adr-0102).
beforeEach(async () => {
  vi.clearAllMocks()
  await prisma.user.create({ data: { id: 'u1' } })
  await prisma.userSettings.create({ data: { userId: 'u1', role: 'MEMBER' } })
})

describe('runProject @SC-163', () => {
  // SC-163 — dispatches each QUEUED task with an assigned agent; returns
  // { dispatched } (the count is not surfaced in the UI — that is a UI concern).
  it('dispatches every queued+assigned task and returns the dispatched count', async () => {
    const project = await createProjectRow()
    const agent = await createAgentRow()
    const t1 = await createTaskRow(project.id, { runState: 'RUN_QUEUED', assignedAgentId: agent.id })
    const t2 = await createTaskRow(project.id, { runState: 'RUN_QUEUED', assignedAgentId: agent.id })

    const result = await runProject({ projectId: project.id }, ctx())

    expect(result).toEqual({ dispatched: 2 })
    expect(taskRunnerFake.startedTasks).toHaveLength(2)
    const dispatchedIds = taskRunnerFake.taskRunner.runTask.mock.calls.map(c => c[0]).sort()
    expect(dispatchedIds).toEqual([t1.id, t2.id].sort())
  })
})

describe('runProject skipsUnassigned @SC-164', () => {
  // SC-164 — only QUEUED tasks with an assigned agent are dispatched.
  it('skips queued tasks with no assigned agent and non-queued tasks', async () => {
    const project = await createProjectRow()
    const agent = await createAgentRow()
    const queuedAssigned = await createTaskRow(project.id, { runState: 'RUN_QUEUED', assignedAgentId: agent.id })
    await createTaskRow(project.id, { runState: 'RUN_QUEUED' }) // no agent
    await createTaskRow(project.id, { runState: 'RUN_NONE', assignedAgentId: agent.id }) // not queued

    const result = await runProject({ projectId: project.id }, ctx())

    expect(result).toEqual({ dispatched: 1 })
    expect(taskRunnerFake.startedTasks).toHaveLength(1)
    expect(taskRunnerFake.taskRunner.runTask.mock.calls[0][0]).toBe(queuedAssigned.id)
  })
})

describe('runBoard @SC-030', () => {
  // SC-030 / SC-168 — running a whole board dispatches each queued+assigned
  // task on it and returns { dispatched }.
  it('dispatches every queued+assigned task on the board', async () => {
    const project = await createProjectRow()
    const board = await prisma.board.create({ data: { name: 'B', projectId: project.id } as any })
    const agent = await createAgentRow()
    const t1 = await createTaskRow(project.id, { boardId: board.id, runState: 'RUN_QUEUED', assignedAgentId: agent.id })
    const t2 = await createTaskRow(project.id, { boardId: board.id, runState: 'RUN_QUEUED', assignedAgentId: agent.id })

    const result = await runBoard({ boardId: board.id }, ctx())

    expect(result).toEqual({ dispatched: 2 })
    expect(taskRunnerFake.taskRunner.runTask.mock.calls.map(c => c[0]).sort()).toEqual([t1.id, t2.id].sort())
  })
})

describe('runBoard skipsUnassigned @SC-169', () => {
  // SC-169 — run-all-on-board skips tasks with no assigned agent.
  it('skips board tasks with no assigned agent', async () => {
    const project = await createProjectRow()
    const board = await prisma.board.create({ data: { name: 'B', projectId: project.id } as any })
    const agent = await createAgentRow()
    const assigned = await createTaskRow(project.id, { boardId: board.id, runState: 'RUN_QUEUED', assignedAgentId: agent.id })
    await createTaskRow(project.id, { boardId: board.id, runState: 'RUN_QUEUED' }) // no agent

    const result = await runBoard({ boardId: board.id }, ctx())

    expect(result).toEqual({ dispatched: 1 })
    expect(taskRunnerFake.taskRunner.runTask.mock.calls[0][0]).toBe(assigned.id)
  })
})
