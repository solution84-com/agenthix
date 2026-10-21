import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createTestTask } from '../../test/factories'

// SC-025 — a board column with autoQueue enabled queues its tasks with no run pending when the
// stage is enabled, and releases them (RUN_QUEUED → RUN_NONE) when it is disabled. The
// logic lives in the `updateBoard` action, which uses the module-level
// `wasp/server` prisma; we mock that to the real test-DB client. The
// dashboard snapshot is a side-effecting collaborator, mocked to a no-op.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { updateBoard } from '../actions'

let n = 0
async function createProjectRow() {
  const project = await createProject({ name: 'P', key: `AQ${(n++).toString().padStart(2, '0')}`.slice(0, 6) })
  // The caller (u1, created in beforeEach) is a member: membership is the only gate (adr-0099).
  await prisma.projectMember.create({ data: { projectId: project.id, userId: 'u1' } })
  return project
}
async function createTaskRow(projectId: string, data: Record<string, unknown>) {
  const agg = await prisma.task.aggregate({ where: { projectId }, _max: { number: true } })
  return createTestTask({ data: { title: 'T', projectId, number: (agg._max.number ?? 0) + 1, onBehalfOfUserId: 'u1', ...data } as any })
}

const COLUMN_OFF = { name: 'doing', label: 'Doing', status: 'IN_PROGRESS', order: 0, color: '#000', autoQueue: false }
const COLUMN_ON = { ...COLUMN_OFF, autoQueue: true }
const userCtx = { user: { id: 'u1' } } as any

beforeEach(async () => {
  vi.clearAllMocks()
  await prisma.user.create({ data: { id: 'u1' } })
  await prisma.userSettings.create({ data: { userId: 'u1', role: 'MEMBER' } })
})

describe('updateBoard autoQueue @SC-025', () => {
  it('queues tasks with no run pending in a column when autoQueue is enabled', async () => {
    const project = await createProjectRow()
    const board = await prisma.board.create({
      data: { name: 'B', projectId: project.id, columns: [COLUMN_OFF] } as any,
    })
    const agent = await createAgent()
    const task = await createTaskRow(project.id, { boardId: board.id, column: 'doing', runState: 'RUN_NONE', assignedAgentId: agent.id })

    await updateBoard({ boardId: board.id, columns: [COLUMN_ON] }, userCtx)

    const after = await prisma.task.findUnique({ where: { id: task.id } })
    expect(after!.runState).toBe('RUN_QUEUED')
  })

  it('leaves a task with no agent as it is — nothing could ever run it', async () => {
    const project = await createProjectRow()
    const board = await prisma.board.create({
      data: { name: 'B', projectId: project.id, columns: [COLUMN_OFF] } as any,
    })
    const task = await createTaskRow(project.id, { boardId: board.id, column: 'doing', runState: 'RUN_NONE', assignedAgentId: null })

    await updateBoard({ boardId: board.id, columns: [COLUMN_ON] }, userCtx)

    const after = await prisma.task.findUnique({ where: { id: task.id } })
    expect(after!.runState).toBe('RUN_NONE')
  })

  it('releases queued tasks back to no run pending when autoQueue is disabled', async () => {
    const project = await createProjectRow()
    const board = await prisma.board.create({
      data: { name: 'B', projectId: project.id, columns: [COLUMN_ON] } as any,
    })
    const task = await createTaskRow(project.id, { boardId: board.id, column: 'doing', runState: 'RUN_QUEUED' })

    await updateBoard({ boardId: board.id, columns: [COLUMN_OFF] }, userCtx)

    const after = await prisma.task.findUnique({ where: { id: task.id } })
    expect(after!.runState).toBe('RUN_NONE')
  })
})

// Changing a board is a change to the project, which its Viewer may not make (adr-0102).
describe('updateBoard by a project Viewer @SC-388', () => {
  async function boardWith(column: typeof COLUMN_OFF, taskState: 'RUN_NONE' | 'RUN_QUEUED') {
    const project = await createProjectRow()
    await prisma.projectMember.update({ where: { projectId_userId: { projectId: project.id, userId: 'u1' } }, data: { role: 'VIEWER' } })
    const board = await prisma.board.create({ data: { name: 'B', projectId: project.id, columns: [column] } as any })
    const task = await createTaskRow(project.id, { boardId: board.id, column: 'doing', runState: taskState })
    return { board, task }
  }

  it('refuses its Viewer turning auto-queue on (403 saying so) and queues nothing', async () => {
    const { board, task } = await boardWith(COLUMN_OFF, 'RUN_NONE')

    await expect(updateBoard({ boardId: board.id, columns: [COLUMN_ON] }, userCtx))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Viewer') })

    expect((await prisma.task.findUnique({ where: { id: task.id } }))!.runState).toBe('RUN_NONE')
    expect(((await prisma.board.findUnique({ where: { id: board.id } }))!.columns as any[])[0].autoQueue).toBe(false)
  })

  it('refuses its Viewer turning auto-queue off (it would release queued work)', async () => {
    const { board, task } = await boardWith(COLUMN_ON, 'RUN_QUEUED')

    await expect(updateBoard({ boardId: board.id, columns: [COLUMN_OFF] }, userCtx))
      .rejects.toMatchObject({ statusCode: 403 })

    expect((await prisma.task.findUnique({ where: { id: task.id } }))!.runState).toBe('RUN_QUEUED')
  })

  it('refuses its Viewer a column list that leaves auto-queue as it was, changing nothing', async () => {
    const { board } = await boardWith(COLUMN_OFF, 'RUN_NONE')

    await expect(updateBoard({ boardId: board.id, columns: [{ ...COLUMN_OFF, label: 'Doing now' }] }, userCtx))
      .rejects.toMatchObject({ statusCode: 403 })

    expect(((await prisma.board.findUnique({ where: { id: board.id } }))!.columns as any[])[0].label).toBe('Doing')
  })
})
