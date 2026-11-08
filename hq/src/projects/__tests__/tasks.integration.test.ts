// Over 300 lines on purpose: the task lifecycle's scenarios, one tagged describe each, sharing their helpers.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask } from '../../test/factories'

// Task scenarios (Tasks area, F-017c). These are data-path concerns the mocked
// unit suite cannot prove, so they run at the integration level against the real
// test DB (ADR-0035), following deleteTaskSession.integration.test.ts.
//
// The task actions/queries split two ways:
//   - actions/queries that touch `context.entities` (runTask,
//     getTasks, getAllTasks, getTaskByKey, now in taskReads) — driven via
//     their Wasp wrappers with a context whose entities are the real test prisma
//     delegates.
//   - actions that delegate to projectService, which imports `prisma` from
//     `wasp/server` — that import is stubbed (the integration vitest config
//     aliases `wasp/server` to a HttpError-only module), so we mock `wasp/server`
//     here to expose the real test prisma plus a working HttpError. This lets the
//     service functions hit the same test database the harness truncates.
//
// Side-effecting collaborators (dashboard snapshot, activity, the task
// runner, the board socket, the artefacts directory) are mocked — they are not
// the behaviour under test.

vi.mock('wasp/server', () => ({
  prisma,
  HttpError: class HttpError extends Error {
    statusCode: number
    constructor(statusCode: number, message?: string) {
      super(message)
      this.statusCode = statusCode
    }
  },
}))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn(), emitTasksToHq: vi.fn() }))
// Deleting a task deletes the site-held half of its session first (SITE-FIRST, SC-346): site resolution runs for
// real, against the project holding the task, but the channel call is mocked, since there is no real site here.
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import {
  deleteTask,
  returnTaskToBacklog,
} from '../actions'
import { moveTaskToBoard } from '../boardOperations'
import { createTask, addAgentToProject } from '../projectService'
import { originByPerson } from '../taskOnBehalfOf'

// ── Helpers ─────────────────────────────────────────────────────────────────

const USER = { id: 'user-1' } as const
const ORIGIN = originByPerson(USER.id)

// Wasp action/query context whose entity delegates are the real test prisma
// client. Only the entities a given operation actually reads are wired. Pass
// `null` (not `undefined`, which would trip the default) for the unauthenticated
// case.
function ctx(user: { id: string } | null = USER) {
  return {
    user: user ?? undefined,
    entities: {
      Task: prisma.task,
      Agent: prisma.agent,
      Project: prisma.project,
      AgentSession: prisma.agentSession,
      TaskAttachment: prisma.taskAttachment,
    },
  } as any
}

let projectSeq = 0
// Through the shared factory rather than a raw create, so a project here names
// an Execution Site the way one created through the product does — a task's
// site is resolved from its project, and a project naming none is refused.
async function makeProject(data: Record<string, unknown> = {}) {
  projectSeq++
  const project = await createProject({ name: `Proj ${projectSeq}`, key: `P${projectSeq}X`, ...data })
  // The acting person is a member of every project here: membership is the only gate (adr-0099).
  await prisma.user.upsert({ where: { id: USER.id }, create: { id: USER.id }, update: {} })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: USER.id } })
  return project
}

async function makeAgent(handle = `agent-${Math.random().toString(36).slice(2, 8)}`, data: Record<string, unknown> = {}) {
  return prisma.agent.create({ data: { name: 'Test Agent', handle, ...data } as any })
}

let siteSeq = 0
async function makeSite() {
  siteSeq++
  return prisma.executionSite.create({
    data: { siteId: `site-${siteSeq}-${Date.now()}`, label: `Site ${siteSeq}` },
  })
}

async function makeBoard(projectId: string, data: Record<string, unknown> = {}) {
  return prisma.board.create({ data: { name: 'Board', projectId, ...data } as any })
}

async function makeTask(projectId: string, data: Record<string, unknown> = {}) {
  const agg = await prisma.task.aggregate({ where: { projectId }, _max: { number: true } })
  const number = (agg._max.number ?? 0) + 1
  return createTestTask({
    data: { title: 'A task', projectId, number, onBehalfOfUserId: USER.id, ...data } as any,
  })
}

// Starting, releasing, clearing and deleting work need someone who works in the project (adr-0102)
// (R-032, R-196), read from the caller's own settings row — a caller without
// one is refused, so every caller here is given it.
beforeEach(async () => {
  vi.clearAllMocks()
  await prisma.user.create({ data: { id: USER.id } })
  await prisma.userSettings.create({ data: { userId: USER.id, role: 'MEMBER' } })
})

// ── SC-174 — placement: a task is always on a board, in a column or its Backlog (adr-0097) ──

describe('createTask placement @SC-174', () => {
  const COLUMNS = [
    { name: 'done', label: 'Done', status: 'DONE', order: 2 },
    { name: 'review', label: 'Review', status: 'IN_PROGRESS', order: 0 },
    { name: 'todo', label: 'To Do', status: 'TODO', order: 1 },
  ]

  it("with a board and no column, lands in the board's Backlog, To do", async () => {
    const project = await makeProject()
    const board = await makeBoard(project.id, { columns: COLUMNS })

    const task = await createTask({ title: 'T', projectId: project.id, boardId: board.id, origin: ORIGIN })

    expect([task.boardId, task.column, task.status]).toEqual([board.id, null, 'TODO'])
  })

  it('with a column named by its state, lands in that column and takes its state', async () => {
    const project = await makeProject()
    const board = await makeBoard(project.id, { columns: COLUMNS })

    const task = await createTask({ title: 'T', projectId: project.id, boardId: board.id, column: 'IN_PROGRESS', origin: ORIGIN })

    expect([task.column, task.status]).toEqual(['review', 'IN_PROGRESS'])
  })

  it('with no column named, lands in the Backlog with no run pending: creating starts nothing (adr-0175)', async () => {
    const project = await makeProject()
    const board = await makeBoard(project.id, { columns: COLUMNS })

    const task = await createTask({ title: 'T', projectId: project.id, boardId: board.id, origin: ORIGIN })

    expect([task.column, task.runState]).toEqual([null, 'RUN_NONE'])
  })

  it("with no board, lands in its project's Project Tasks Backlog", async () => {
    const project = await makeProject()

    const task = await createTask({ title: 'Backlog item', projectId: project.id, origin: ORIGIN })

    const board = await prisma.board.findUniqueOrThrow({ where: { id: task.boardId! } })
    expect([board.projectId, board.kind, task.column]).toEqual([project.id, 'PROJECT_TASKS', null])
  })
})

// ── SC-036 — return a task from a board to the backlog ────────────────────────

describe('returnTaskToBacklog @SC-036', () => {
  it('clears the column and resets status/execution but keeps the boardId', async () => {
    const project = await makeProject()
    const board = await makeBoard(project.id)
    const task = await makeTask(project.id, {
      boardId: board.id,
      column: 'todo',
      status: 'IN_PROGRESS',
      runState: 'RUN_QUEUED',
    })

    await returnTaskToBacklog({ taskId: task.id }, ctx())

    const after = await prisma.task.findUnique({ where: { id: task.id } })
    expect(after?.column).toBeNull()
    expect(after?.status).toBe('TODO')
    expect(after?.runState).toBe('RUN_NONE')
    // returnTaskToBacklog leaves boardId intact: the Backlog is the board's own.
    expect(after?.boardId).toBe(board.id)
  })
})

// ── SC-037 — move a task to another board: it lands in that board's Backlog ──

describe('moveTaskToBoard @SC-037', () => {
  it("puts the task in the other board's Backlog and withdraws its queued run", async () => {
    const project = await makeProject()
    const board = await makeBoard(project.id)
    const other = await makeBoard(project.id)
    const task = await makeTask(project.id, {
      boardId: board.id,
      column: 'todo',
      status: 'IN_PROGRESS',
      runState: 'RUN_QUEUED',
    })

    await moveTaskToBoard({ taskId: task.id, boardId: other.id }, ctx())

    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect([after.boardId, after.column, after.status, after.runState]).toEqual([other.id, null, 'TODO', 'RUN_NONE'])
  })

  it('refuses an archived board', async () => {
    const project = await makeProject()
    const board = await makeBoard(project.id)
    const archived = await makeBoard(project.id, { archivedAt: new Date() })
    const task = await makeTask(project.id, { boardId: board.id, column: 'todo' })

    await expect(moveTaskToBoard({ taskId: task.id, boardId: archived.id }, ctx())).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).boardId).toBe(board.id)
  })
})

// ── SC-039 — permanently delete a task ────────────────────────────────────────

describe('deleteTask @SC-039', () => {
  it('removes the task row', async () => {
    const project = await makeProject()
    const task = await makeTask(project.id)

    await deleteTask({ taskId: task.id }, ctx())

    const after = await prisma.task.findUnique({ where: { id: task.id } })
    expect(after).toBeNull()
  })

  it('rejects an unauthenticated caller and deletes nothing', async () => {
    const project = await makeProject()
    const task = await makeTask(project.id)

    await expect(deleteTask({ taskId: task.id }, ctx(null))).rejects.toThrow()
    const after = await prisma.task.findUnique({ where: { id: task.id } })
    expect(after).not.toBeNull()
  })
})

// ── an agent has no home site: membership no longer checks execution sites ─────

describe('addAgentToProject places no site requirement on the agent', () => {
  it('assigns an agent to a project on a different Execution Site than any it already works on', async () => {
    const siteA = await makeSite()
    const siteB = await makeSite()
    const otherProject = await makeProject({ executionSiteId: siteB.id })
    const project = await makeProject({ executionSiteId: siteA.id })
    const agent = await makeAgent()
    await addAgentToProject({ projectId: otherProject.id, agentId: agent.id })

    await addAgentToProject({ projectId: project.id, agentId: agent.id })

    const assignment = await prisma.projectAgent.findUnique({
      where: { projectId_agentId: { projectId: project.id, agentId: agent.id } },
    })
    expect(assignment).not.toBeNull()
  })
})
