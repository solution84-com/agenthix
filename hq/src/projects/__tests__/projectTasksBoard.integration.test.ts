/**
 * Project Tasks (adr-0097), against the real test DB: every project is made
 * with it; it cannot be deleted, renamed, re-columned, archived or given
 * sprints, whoever asks — the service refuses, not only the screen; and every
 * path that makes a task without naming a board puts it there, in its Backlog.
 * Written by lane W of the every-screen-reviewed unit; run by the lead.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createAgent, ensureExecutionSite, createProject as projectRow } from '../../test/factories'

const site = vi.hoisted(() => ({ seedFilesOnSite: vi.fn(), ensureDirOnSite: vi.fn() }))
vi.mock('../../storage/locationFileStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/locationFileStore')>()),
  ...site,
}))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))

import { createProject as createProjectRecord, createBoard, updateBoard, deleteBoard, archiveBoard, finishSprint, createTask, ensureProjectTasks, DEFAULT_BOARD_COLUMNS } from '../projectService'
import { createTask as createTaskAction } from '../actions'
import { ensurePersonalProject } from '../personalProject'
import { originByPerson } from '../taskOnBehalfOf'
import { createTaskOp } from '../../server/controlplane/taskWriteOps'
import { createRoutine } from '../../automation/routines'
import { ctx } from './projectsHarness'
import { chatCtx, connCtx } from '../../server/controlplane/__tests__/controlPlaneFixtures'

const projectTasksOf = (projectId: string) => prisma.board.findMany({ where: { projectId, kind: 'PROJECT_TASKS' } })

async function madeProject() {
  const admin = await createUserWithRole('ADMIN')
  const s = await ensureExecutionSite()
  const project = await createProjectRecord({ name: `Proj ${Math.random()}`, executionSiteId: s.id, createdByUserId: admin.id })
  const [board] = await projectTasksOf(project.id)
  return { admin, project, board }
}

describe('every project is made with Project Tasks @SC-540', () => {
  it('a project made by a person', async () => {
    const { board } = await madeProject()
    expect(board).toMatchObject({ name: 'Project Tasks', kind: 'PROJECT_TASKS', archivedAt: null, columns: DEFAULT_BOARD_COLUMNS })
  })

  it("a person's personal project", async () => {
    const owner = await createUser()
    const personal = await ensurePersonalProject(owner.id)
    expect(await projectTasksOf(personal.id)).toHaveLength(1)
  })

  it('ensureProjectTasks makes one only when there is none, and answers the same one after', async () => {
    const project = await projectRow()
    const first = await ensureProjectTasks(project.id)
    expect(await ensureProjectTasks(project.id)).toBe(first)
    expect(await projectTasksOf(project.id)).toHaveLength(1)
  })
})

describe('Project Tasks cannot be changed, whoever asks — the service refuses @SC-540', () => {
  it.each([
    ['renamed', (id: string) => updateBoard({ boardId: id, name: 'Mine' })],
    ['given other columns', (id: string) => updateBoard({ boardId: id, columns: [{ name: 'x', label: 'X', status: 'TODO', order: 0, color: '#000' }] })],
    ['deleted', (id: string) => deleteBoard(id)],
    ['archived', (id: string) => archiveBoard(id)],
    ['given a sprint to finish', (id: string) => finishSprint(id, 'next')],
  ])('is not %s, and stays as it was', async (_what, change) => {
    const { board } = await madeProject()
    await expect(change(board.id)).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.board.findUniqueOrThrow({ where: { id: board.id } })).toEqual(board)
  })

  it('is not made a second time by createBoard', async () => {
    const { project } = await madeProject()
    await expect(createBoard({ projectId: project.id, name: 'Project Tasks', kind: 'PROJECT_TASKS' as never })).rejects.toMatchObject({ statusCode: 400 })
    expect(await projectTasksOf(project.id)).toHaveLength(1)
  })
})

describe('every path that makes a task without a board puts it on Project Tasks, in its Backlog @SC-541', () => {
  async function landed(projectId: string, taskId: string) {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } })
    const [board] = await projectTasksOf(projectId)
    expect([task.boardId, task.column, task.status]).toEqual([board.id, null, 'TODO'])
  }

  it('the service', async () => {
    const { admin, project } = await madeProject()
    const task = await createTask({ title: 'T', projectId: project.id, origin: originByPerson(admin.id) })
    await landed(project.id, task.id)
  })

  it("a person's action", async () => {
    const { admin, project } = await madeProject()
    const task = await createTaskAction({ projectId: project.id, title: 'T' }, ctx(admin))
    await landed(project.id, task.id)
  })

  it("an agent's tool in a person's chat, and a person's connection", async () => {
    const { admin, project } = await madeProject()
    // The chat run's session, s1, which the tool reads to find whose run it is.
    await prisma.agent.upsert({ where: { id: 'agent-1' }, create: { id: 'agent-1', name: 'Agent', handle: 'agent-1' }, update: {} })
    await prisma.agentSession.create({ data: { id: 's1', userId: admin.id, agentId: 'agent-1', sessionType: 'chat' } })
    const byChat = await createTaskOp(chatCtx(admin.id, 'ADMIN'), { title: 'T', projectId: project.id }) as { taskId: string }
    const byConnection = await createTaskOp(connCtx(admin.id, { role: 'ADMIN' }), { title: 'U', projectId: project.id }) as { taskId: string }
    await landed(project.id, byChat.taskId)
    await landed(project.id, byConnection.taskId)
  })

  it('a routine whose template names no board', async () => {
    const { admin, project } = await madeProject()
    const routine = await createRoutine(
      project.id,
      { title: 'Weekly', description: null, priority: 'MEDIUM', labels: [], assignedAgentId: null, boardId: null },
      { rule: { kind: 'interval', every: 1, unit: 'days' }, timezone: 'UTC' },
      { kind: 'person', userId: admin.id },
    )
    const [round] = await prisma.task.findMany({ where: { routineId: routine.id } })
    await landed(project.id, round.id)
  })

  it('a project made some other way gets its Project Tasks the first time a task needs it', async () => {
    const project = await projectRow()
    const person = await createUser()
    const task = await createTask({ title: 'T', projectId: project.id, origin: originByPerson(person.id) })
    await landed(project.id, task.id)
  })
})

describe('deleting another board @SC-544', () => {
  it("moves its tasks to Project Tasks, and withdraws a queued run of one that lands in the Backlog", async () => {
    const { admin, project, board: projectTasks } = await madeProject()
    const other = await createBoard({ projectId: project.id, name: 'Bugs' })
    const queued = await prisma.task.create({ data: { title: 'Q', projectId: project.id, number: 1, boardId: other.id, column: 'todo', runState: 'RUN_QUEUED', onBehalfOfUserId: admin.id } })
    await deleteBoard(other.id, project.id)
    expect(await prisma.task.findUniqueOrThrow({ where: { id: queued.id } })).toMatchObject({ boardId: projectTasks.id, column: null, runState: 'RUN_NONE' })
  })
})
