/**
 * Board Service
 * =============
 * Boards as lasting workflows (adr-0097): every project's Project Tasks, and the
 * workflow and sprint boards people make, archived rather than completed. No
 * auth, no HTTP — called by Wasp actions and the agents' tools. Re-exported
 * from `projectService`.
 */
import { prisma, HttpError } from 'wasp/server'
import type { Prisma, BoardKind } from '@prisma/client'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { columnsFromInput, checkedColumns, projectTasksBoardCreate, type ColumnInput } from './boardColumns'
import { DEFAULT_SPRINT_DAYS, firstSprintDates } from './sprintDates'
import { withdrawPendingRun } from './taskRunMoves'

export * from './boardColumns'

type Db = Pick<Prisma.TransactionClient, 'board'>

/**
 * The project's Project Tasks board, made if it has none. Every creation path
 * makes it with the project; this also covers a project made some other way
 * (a test fixture), so a task put on no board always has one to go to.
 */
export async function ensureProjectTasks(projectId: string, db: Db = prisma): Promise<string> {
  const found = await db.board.findFirst({ where: { projectId, kind: 'PROJECT_TASKS' }, select: { id: true }, orderBy: { createdAt: 'asc' } })
  if (found) return found.id
  const created = await db.board.create({ data: { ...projectTasksBoardCreate(), projectId }, select: { id: true } })
  return created.id
}

/** The board a task is put on: the one named, or Project Tasks when none is. */
export async function boardForNewTask(projectId: string, boardId: string | null | undefined): Promise<string> {
  return boardId ? boardId : ensureProjectTasks(projectId)
}

/** Refuses a change Project Tasks does not allow, for everyone, whatever path asks. */
export async function refuseOnProjectTasks(boardId: string, act: string): Promise<{ kind: BoardKind; projectId: string; archivedAt: Date | null }> {
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { kind: true, projectId: true, archivedAt: true } })
  if (!board) throw new HttpError(404, 'Board not found')
  if (board.kind === 'PROJECT_TASKS') throw new HttpError(400, `${act} is not possible for Project Tasks`)
  return board
}

/** A task cannot be put on an archived board: unarchive it first. */
export async function refuseArchivedBoard(boardId: string): Promise<void> {
  const board = await prisma.board.findUnique({ where: { id: boardId }, select: { archivedAt: true } })
  if (!board) throw new HttpError(404, 'Board not found')
  if (board.archivedAt) throw new HttpError(400, 'That board is archived; unarchive it to put work on it')
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/**
 * `project` narrows the listing to the projects the reader may see — for a
 * person, those they are entitled to, exactly as the browser's own board
 * listing does (`getAllBoards`'s `entitledProjectsFilter`). Project Tasks
 * first; archived boards only when asked for.
 */
export async function listBoards(projectId: string | undefined, project: Prisma.ProjectWhereInput, includeArchived = false) {
  const boards = await prisma.board.findMany({
    where: { ...(projectId ? { projectId } : {}), project, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, projectId: true, kind: true, archivedAt: true, columns: true },
  })
  return projectTasksFirst(boards)
}

export function projectTasksFirst<T extends { kind: BoardKind }>(boards: T[]): T[] {
  return [...boards.filter(b => b.kind === 'PROJECT_TASKS'), ...boards.filter(b => b.kind !== 'PROJECT_TASKS')]
}

export async function getBoard(boardId: string) {
  return prisma.board.findUnique({
    where: { id: boardId },
    include: { project: { select: { name: true } } },
  })
}

// ── Changes ───────────────────────────────────────────────────────────────────

export async function createBoard(params: {
  projectId: string
  name: string
  /** Workflow unless it has sprints; Project Tasks is never made here. */
  kind?: 'WORKFLOW' | 'SPRINTS'
  /** The board template version it is made from, kept read-only (adr-0072). */
  madeFromVersionId?: string
  columns?: ColumnInput[]
  /** A sprint board's sprint length, in days. */
  sprintDays?: number
  now?: Date
}) {
  if ((params.kind as string) === 'PROJECT_TASKS') throw new HttpError(400, 'Every project has its one Project Tasks already')
  const name = params.name.trim()
  if (!name) throw new HttpError(400, 'A board needs a name')
  const kind = params.kind ?? 'WORKFLOW'
  const columns = columnsFromInput(params.columns)
  const sprint = kind === 'SPRINTS' ? firstSprintDates(params.now ?? new Date(), params.sprintDays ?? DEFAULT_SPRINT_DAYS) : null
  const created = await prisma.board.create({
    data: {
      name,
      projectId: params.projectId,
      kind,
      columns: columns as unknown as Prisma.InputJsonValue,
      madeFromVersionId: params.madeFromVersionId,
      ...(sprint ? { sprints: { create: { number: 1, ...sprint } } } : {}),
    },
  })
  triggerSnapshotPush()
  return created
}

/** Renames a board or changes its columns. Project Tasks keeps its name and columns. */
export async function updateBoard(params: { boardId: string; name?: string; columns?: unknown }) {
  if (params.name === undefined && params.columns === undefined) return prisma.board.findUniqueOrThrow({ where: { id: params.boardId } })
  await refuseOnProjectTasks(params.boardId, params.columns !== undefined ? 'Changing the columns' : 'Renaming')
  const data: Prisma.BoardUpdateInput = {}
  if (params.name !== undefined) {
    if (!params.name.trim()) throw new HttpError(400, 'A board needs a name')
    data.name = params.name.trim()
  }
  if (params.columns !== undefined) {
    const columns = checkedColumns(params.columns)
    // A column that goes cannot hold tasks: they would sit in a column that matches nothing, and show on no board.
    const names = columns.map(c => c.name)
    const stranded = await prisma.task.count({ where: { boardId: params.boardId, AND: [{ column: { not: null } }, { column: { notIn: names } }] } })
    if (stranded > 0) {
      throw new HttpError(409, `${stranded === 1 ? 'A task is' : `${stranded} tasks are`} still in a column this change removes. Move them first.`)
    }
    data.columns = columns as unknown as Prisma.InputJsonValue
  }
  return prisma.board.update({ where: { id: params.boardId }, data })
}

export async function archiveBoard(boardId: string) {
  await refuseOnProjectTasks(boardId, 'Archiving')
  const result = await prisma.board.update({ where: { id: boardId }, data: { archivedAt: new Date() } })
  triggerSnapshotPush()
  return result
}

export async function unarchiveBoard(boardId: string) {
  await refuseOnProjectTasks(boardId, 'Unarchiving')
  const result = await prisma.board.update({ where: { id: boardId }, data: { archivedAt: null } })
  triggerSnapshotPush()
  return result
}

/**
 * Deletes a board, never Project Tasks. Its tasks are not deleted: they go to
 * Project Tasks — its Done for those already done, its Backlog for the rest,
 * where nothing starts them (a queued run is withdrawn). `projectId`, when
 * given, constrains the sweep to the project the caller was checked against.
 */
export async function deleteBoard(boardId: string, projectId?: string) {
  const board = await refuseOnProjectTasks(boardId, 'Deleting')
  const target = await ensureProjectTasks(board.projectId)
  const scope = { boardId, ...(projectId ? { projectId } : {}) }
  const pending = await prisma.task.findMany({ where: { ...scope, status: { not: 'DONE' } }, select: { id: true } })
  await prisma.$transaction([
    prisma.task.updateMany({ where: { ...scope, status: 'DONE' }, data: { boardId: target, column: 'done', sprintId: null } }),
    prisma.task.updateMany({ where: { ...scope, status: { not: 'DONE' } }, data: { boardId: target, column: null, sprintId: null, status: 'TODO' } }),
  ])
  for (const t of pending) await withdrawPendingRun(t.id)
  const result = await prisma.board.delete({ where: { id: boardId } })
  triggerSnapshotPush()
  return result
}
