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

import { deleteTask, moveTaskToColumn } from '../actions'
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

// ── SC-174 — placement: a task is on no board, in one of its type's columns (adr-0174, adr-0176) ──

describe('createTask placement @SC-174', () => {
  it("with nothing named, lands on the project's Task type in its Backlog, with no run pending: creating starts nothing (adr-0175)", async () => {
    const project = await makeProject()

    const task = await createTask({ title: 'Backlog item', projectId: project.id, origin: ORIGIN })

    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, select: { state: true, runState: true, type: { select: { kind: true } } } })
    expect(row).toEqual({ state: 'BACKLOG', runState: 'RUN_NONE', type: { kind: 'TASK' } })
  })

  it('with a state named, lands on its type\'s default column for that state', async () => {
    const project = await makeProject()

    const task = await createTask({ title: 'T', projectId: project.id, state: 'IN_PROGRESS', origin: ORIGIN })

    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, select: { state: true, typeColumn: { select: { state: true, defaultForState: true } } } })
    expect(row).toEqual({ state: 'IN_PROGRESS', typeColumn: { state: 'IN_PROGRESS', defaultForState: true } })
  })
})

// ── SC-036 — moveTaskToColumn: one of the task's type's columns ──────────

/** The task's type's column for a state. */
async function columnOf(taskId: string, state: 'BACKLOG' | 'DONE') {
  const { typeId } = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { typeId: true } })
  return (await prisma.typeColumn.findFirstOrThrow({ where: { typeId: typeId!, state } })).id
}

describe('moveTaskToColumn @SC-036', () => {
  it("to a Backlog column puts it in Backlog and takes it out of its agent's line", async () => {
    const project = await makeProject()
    const task = await createTask({ title: 'T', projectId: project.id, state: 'TODO', origin: ORIGIN })
    await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_QUEUED' } })

    await moveTaskToColumn({ taskId: task.id, columnId: await columnOf(task.id, 'BACKLOG') }, ctx())

    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id } })
    expect([after.state, after.runState, after.runStartedBy]).toEqual(['BACKLOG', 'RUN_NONE', null])
  })

  it("refuses a column that is not one of its type's, or none, and moves nothing", async () => {
    const project = await makeProject()
    const task = await createTask({ title: 'T', projectId: project.id, state: 'TODO', origin: ORIGIN })
    const elsewhere = await createTask({ title: 'U', projectId: (await makeProject()).id, state: 'TODO', origin: ORIGIN })

    await expect(moveTaskToColumn({ taskId: task.id, columnId: await columnOf(elsewhere.id, 'DONE') }, ctx())).rejects.toMatchObject({ statusCode: 400 })
    await expect(moveTaskToColumn({ taskId: task.id } as never, ctx())).rejects.toMatchObject({ statusCode: 400 })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).state).toBe('TODO')
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
