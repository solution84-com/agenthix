/**
 * A task is on no board (adr-0176), against the real test DB: a project is made with no board row, only its Task
 * and Epic types; every path that makes a task without naming its place puts it on the project's Task type, in that
 * type's Backlog column; and deleting a saved board changes no task.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, ensureExecutionSite, createProject as projectRow } from '../../test/factories'

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

import { createProject as createProjectRecord, createTask } from '../projectService'
import { createTask as createTaskAction } from '../actions'
import { ensurePersonalProject } from '../personalProject'
import { originByPerson } from '../taskOnBehalfOf'
import { saveBoard, deleteSavedBoard } from '../boardSaveService'
import { createTaskOp } from '../../server/controlplane/taskWriteOps'
import { ctx } from './projectsHarness'
import { chatCtx, connCtx } from '../../server/controlplane/__tests__/controlPlaneFixtures'

async function madeProject() {
  const admin = await createUserWithRole('ADMIN')
  const s = await ensureExecutionSite()
  const project = await createProjectRecord({ name: `Proj ${Math.random()}`, executionSiteId: s.id, createdByUserId: admin.id })
  return { admin, project }
}

describe('a project is made with no board @SC-540', () => {
  it('a project made by a person, and a personal one: their types, and no board row', async () => {
    const { project } = await madeProject()
    const personal = await ensurePersonalProject((await createUser()).id)
    for (const p of [project, personal]) {
      expect(await prisma.board.count({ where: { projectId: p.id } })).toBe(0)
      expect((await prisma.taskType.findMany({ where: { projectId: p.id }, select: { kind: true } })).map(t => t.kind).sort()).toEqual(['EPIC', 'TASK'])
    }
  })
})

describe("every path that makes a task without naming its place puts it in its Task type's Backlog @SC-541", () => {
  async function landed(projectId: string, taskId: string) {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { state: true, rank: true, type: { select: { kind: true } }, typeColumn: { select: { state: true, defaultForState: true } } } })
    expect(task).toMatchObject({ state: 'BACKLOG', type: { kind: 'TASK' }, typeColumn: { state: 'BACKLOG', defaultForState: true } })
    expect(task.rank).not.toBeNull()
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

  it("a person's action naming a state lands in it", async () => {
    const { admin, project } = await madeProject()
    const task = await createTaskAction({ projectId: project.id, title: 'T', state: 'IN_PROGRESS' }, ctx(admin))
    expect(task).toMatchObject({ state: 'IN_PROGRESS' })
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

  it('a project made some other way gets its Task type the first time a task needs it', async () => {
    const project = await projectRow()
    const person = await createUser()
    const task = await createTask({ title: 'T', projectId: project.id, origin: originByPerson(person.id) })
    await landed(project.id, task.id)
  })
})

describe('deleting a saved board @SC-544', () => {
  it('changes no task: its place and its run stay as they were', async () => {
    const { admin, project } = await madeProject()
    const board = await saveBoard({ projectId: project.id, name: 'Everything', kind: 'STATE' })
    const queued = await createTask({ title: 'Q', projectId: project.id, state: 'TODO', origin: originByPerson(admin.id) })
    await prisma.task.update({ where: { id: queued.id }, data: { runState: 'RUN_QUEUED' } })
    const before = await prisma.task.findUniqueOrThrow({ where: { id: queued.id }, select: { columnId: true, state: true, runState: true, rank: true } })
    await deleteSavedBoard(board.id)
    expect(await prisma.task.findUniqueOrThrow({ where: { id: queued.id }, select: { columnId: true, state: true, runState: true, rank: true } })).toEqual(before)
  })
})
