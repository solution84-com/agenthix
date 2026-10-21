import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask } from '../../test/factories'
// HttpError shim that the `wasp/server` vitest alias resolves to.
import { HttpError } from 'wasp/server'

// Projects + boards service behaviour, asserted against the real test DB
// (ADR-0035). The service imports `prisma` from `wasp/server`; in the vitest
// alias that module is the HttpError shim only, so we mock `wasp/server` to
// hand the service the real test-DB client (plus the real HttpError). The
// side-effecting collaborators (workspace provisioning, dashboard
// snapshot/activity, socket emits) are not the behaviour under test, so they
// are mocked to no-ops.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import {
  deleteProject,
  deleteBoard,
  createBoard,
  updateBoard,
  listBoards,
  moveTaskToColumn,
  addAgentToProject,
  removeAgentFromProject,
  parseColumns,
} from '../projectService'

// ── Local helpers ─────────────────────────────────────────────────────────────
// A project goes through the shared factory, which places it on a registered
// site: placement resolves from the storage a run is for and refuses a project
// that names no machine, so a raw row here is one no install could produce.
let n = 0
const uniq = (p: string) => `${p}_${Date.now().toString(36)}_${n++}`

function createProjectRow(data: Record<string, unknown> = {}) {
  return createProject({ name: 'Proj', key: `K${(n++).toString().padStart(2, '0')}`.slice(0, 6), ...data })
}
function createAgentRow(data: Record<string, unknown> = {}) {
  return prisma.agent.create({ data: { name: 'Agent', handle: uniq('agent'), ...data } as any })
}
async function createTaskRow(projectId: string, data: Record<string, unknown> = {}) {
  const agg = await prisma.task.aggregate({ where: { projectId }, _max: { number: true } })
  return createTestTask({
    data: { title: 'T', projectId, number: (agg._max.number ?? 0) + 1, onBehalfOfUserId: 'person-1', ...data } as any,
  })
}
const DONE_COLUMNS = [
  { name: 'todo', label: 'To Do', status: 'TODO', order: 0, color: '#000' },
  { name: 'done', label: 'Done', status: 'DONE', order: 1, color: '#0f0' },
]

beforeEach(() => vi.clearAllMocks())

describe('deleteProject @SC-019', () => {
  // SC-019 / SC-160 — deletion cascades to boards and tasks in one transaction.
  it('removes the project and cascades to its boards and tasks', async () => {
    const project = await createProjectRow()
    const board = await prisma.board.create({ data: { name: 'B', projectId: project.id } as any })
    const task = await createTaskRow(project.id, { boardId: board.id })

    await deleteProject(project.id)

    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull()
    expect(await prisma.board.findUnique({ where: { id: board.id } })).toBeNull()
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull()
  })
})

describe('deleteBoard @SC-028', () => {
  // SC-028 — a board is deleted but its tasks are kept, on Project Tasks (adr-0097).
  it("moves its tasks to Project Tasks — the open ones to its Backlog, the done ones to its Done", async () => {
    const project = await createProjectRow()
    const board = await prisma.board.create({ data: { name: 'B', projectId: project.id, columns: DONE_COLUMNS } as any })
    const open = await createTaskRow(project.id, { boardId: board.id, column: 'todo' })
    const done = await createTaskRow(project.id, { boardId: board.id, column: 'done', status: 'DONE' })

    await deleteBoard(board.id)

    expect(await prisma.board.findUnique({ where: { id: board.id } })).toBeNull()
    const projectTasks = await prisma.board.findFirstOrThrow({ where: { projectId: project.id, kind: 'PROJECT_TASKS' } })
    const openAfter = await prisma.task.findUniqueOrThrow({ where: { id: open.id } })
    expect([openAfter.boardId, openAfter.column, openAfter.status]).toEqual([projectTasks.id, null, 'TODO'])
    const doneAfter = await prisma.task.findUniqueOrThrow({ where: { id: done.id } })
    expect([doneAfter.boardId, doneAfter.column, doneAfter.status]).toEqual([projectTasks.id, 'done', 'DONE'])
  })
})

describe('listBoards @SC-022', () => {
  // SC-022 — user can view boards under a project (scoped by projectId).
  it('lists only the boards belonging to the given project', async () => {
    const p1 = await createProjectRow()
    const p2 = await createProjectRow()
    const b1 = await prisma.board.create({ data: { name: 'B1', projectId: p1.id } as any })
    await prisma.board.create({ data: { name: 'B2', projectId: p2.id } as any })

    const boards = await listBoards(p1.id, {})
    expect(boards.map(b => b.id)).toEqual([b1.id])
  })

  it('lists Project Tasks first, and archived boards only when asked @SC-544', async () => {
    const project = await createProjectRow()
    const live = await createBoard({ projectId: project.id, name: 'Live' })
    const old = await createBoard({ projectId: project.id, name: 'Old' })
    await prisma.board.update({ where: { id: old.id }, data: { archivedAt: new Date() } })
    const projectTasks = await prisma.board.create({ data: { name: 'Project Tasks', projectId: project.id, kind: 'PROJECT_TASKS' } })

    expect((await listBoards(project.id, {})).map(b => b.id)).toEqual([projectTasks.id, live.id])
    expect((await listBoards(project.id, {}, true)).map(b => b.id)).toEqual([projectTasks.id, live.id, old.id])
  })
})

describe('createBoard @SC-023', () => {
  // SC-023 — create a board with named columns; columns are stored with order +
  // uppercased status and a colour assigned per index.
  it('creates a board with the supplied named columns', async () => {
    const project = await createProjectRow()
    const created = await createBoard({
      projectId: project.id,
      name: 'Sprint 1',
      columns: [
        { name: 'ready', label: 'Ready', status: 'todo' },
        { name: 'shipping', label: 'Shipping', status: 'done' },
      ],
    })
    const columns = parseColumns(created.columns)
    expect(columns.map(s => s.name)).toEqual(['ready', 'shipping'])
    expect(columns.map(s => s.status)).toEqual(['TODO', 'DONE'])
    expect(columns.map(s => s.order)).toEqual([0, 1])
  })

  it('falls back to default To Do / In Progress / Done columns when none supplied', async () => {
    const project = await createProjectRow()
    const created = await createBoard({ projectId: project.id, name: 'Default' })
    const columns = parseColumns(created.columns)
    expect(columns.map(s => s.status)).toEqual(['TODO', 'IN_PROGRESS', 'DONE'])
  })
})

describe('updateBoard @SC-024', () => {
  // SC-024 — user can edit a board's columns.
  it('persists edited board columns', async () => {
    const project = await createProjectRow()
    const board = await createBoard({ projectId: project.id, name: 'Edit me' })
    const newColumns = [{ name: 'a', label: 'Alpha', status: 'TODO', order: 0, color: '#111' }]

    const updated = await updateBoard({ boardId: board.id, columns: newColumns })
    expect(parseColumns(updated.columns).map(s => s.label)).toEqual(['Alpha'])
  })
})

describe('moveTaskToColumn @SC-031', () => {
  // SC-031 — drag a task between columns; the server performs no cross-board
  // rejection (prevention is UI-only). Asserting current behaviour.
  it('moves a task to a different column on the same board', async () => {
    const project = await createProjectRow()
    const board = await createBoard({ projectId: project.id, name: 'B', columns: DONE_COLUMNS })
    const task = await createTaskRow(project.id, { boardId: board.id, column: 'todo' })

    const moved = await moveTaskToColumn({ taskId: task.id, column: 'done', boardId: board.id })
    expect(moved.column).toBe('done')
    expect(moved.status).toBe('DONE')
  })

  it('does not reject moving a task onto a different board (no cross-board guard)', async () => {
    // Cross-board drag is allowed server-side as long as the column exists on the
    // target board; prevention of accidental cross-board drags is a UI concern.
    const project = await createProjectRow()
    const boardA = await createBoard({ projectId: project.id, name: 'A', columns: DONE_COLUMNS })
    const boardB = await createBoard({ projectId: project.id, name: 'B', columns: DONE_COLUMNS })
    const task = await createTaskRow(project.id, { boardId: boardA.id, column: 'todo' })

    const moved = await moveTaskToColumn({ taskId: task.id, column: 'todo', boardId: boardB.id })
    expect(moved.boardId).toBe(boardB.id)
  })

  it('rejects (400) a column not defined on the target board', async () => {
    // F-010a: the column must exist on the board the task lands on.
    const project = await createProjectRow()
    const board = await createBoard({ projectId: project.id, name: 'B', columns: DONE_COLUMNS })
    const task = await createTaskRow(project.id, { boardId: board.id, column: 'todo' })

    await expect(
      moveTaskToColumn({ taskId: task.id, column: 'nonexistent', boardId: board.id }),
    ).rejects.toMatchObject({ statusCode: 400 })

    const after = await prisma.task.findUnique({ where: { id: task.id } })
    expect(after!.column).toBe('todo')
  })
})

describe('moveTaskToColumn doneClearsArchived @SC-167', () => {
  // SC-167 — moving a task into a done column clears its archived flag.
  it('clears archived when moving into a done column', async () => {
    const project = await createProjectRow()
    const board = await createBoard({ projectId: project.id, name: 'B', columns: DONE_COLUMNS })
    const task = await createTaskRow(project.id, { boardId: board.id, column: 'todo', archived: true })

    const moved = await moveTaskToColumn({ taskId: task.id, column: 'done', boardId: board.id })
    expect(moved.archived).toBe(false)
  })
})

describe('addAgentToProject @SC-020', () => {
  // SC-020 / SC-162 — add + remove agents as members; adding twice is
  // idempotent (upsert, no duplicate ProjectAgent row).
  it('adds an agent and removing it deletes the membership', async () => {
    const project = await createProjectRow()
    const agent = await createAgentRow()

    await addAgentToProject({ projectId: project.id, agentId: agent.id })
    expect(await prisma.projectAgent.count({ where: { projectId: project.id } })).toBe(1)

    await removeAgentFromProject({ projectId: project.id, agentId: agent.id, openTasksTo: null, newDefaultAgentId: null })
    expect(await prisma.projectAgent.count({ where: { projectId: project.id } })).toBe(0)
  })

  it('is idempotent — adding an already-member agent creates no duplicate', async () => {
    const project = await createProjectRow()
    const agent = await createAgentRow()

    await addAgentToProject({ projectId: project.id, agentId: agent.id })
    await addAgentToProject({ projectId: project.id, agentId: agent.id })

    expect(await prisma.projectAgent.count({ where: { projectId: project.id } })).toBe(1)
  })
})

// Keep HttpError import referenced so the resolved alias is exercised.
void HttpError
