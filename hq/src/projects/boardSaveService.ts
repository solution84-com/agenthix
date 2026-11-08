/**
 * Saving a way of looking as a board (adr-0176, spec N5): a name, what it is a view of, and its filter. A saved board
 * is the project's: everyone in it sees it in Boards. What it is a view of never changes once saved; its name and
 * filter do. Deleting one deletes only the view: every task, value, column and rank stays. The two built-in boards
 * have no row and are never renamed or deleted; changing one is saved as a new board. No auth, no HTTP: the operations
 * check who may (boardViewOperations.ts).
 */
import { HttpError, prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import { parseBoardFilter, type BoardDefinition } from '@agenthix/core'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { ensureProjectTasks } from './boardService'
import { BOARD_NOT_FOUND, checkedSpec } from './boardViewService'

export const BOARD_NAME_MAX_LENGTH = 60
export const PROJECT_SAVED_BOARDS_MAX = 50

const SAVED_SELECT = {
  id: true, projectId: true, name: true, view: true, typeId: true, fieldId: true, filter: true, createdAt: true, updatedAt: true,
} satisfies Prisma.BoardSelect

type SavedRow = Prisma.BoardGetPayload<{ select: typeof SAVED_SELECT }>

export function boardDefinition(b: SavedRow): BoardDefinition {
  return {
    id: b.id, projectId: b.projectId, name: b.name, kind: b.view!, typeId: b.typeId, fieldId: b.fieldId,
    filter: parseBoardFilter(b.filter), createdAt: b.createdAt, updatedAt: b.updatedAt,
  }
}

function checkedName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name === '' || name.length > BOARD_NAME_MAX_LENGTH) {
    throw new HttpError(400, `A board's name is 1 to ${BOARD_NAME_MAX_LENGTH} characters. Nothing was changed.`)
  }
  return name
}

async function refuseTakenName(projectId: string, name: string, exceptId?: string): Promise<void> {
  const taken = await prisma.board.findFirst({
    where: { projectId, view: { not: null }, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  })
  if (taken) throw new HttpError(409, `This project already has a board named "${name}". Choose another name. Nothing was changed.`)
}

async function refuseOverLimit(projectId: string): Promise<void> {
  const count = await prisma.board.count({ where: { projectId, view: { not: null } } })
  if (count >= PROJECT_SAVED_BOARDS_MAX) {
    throw new HttpError(409, `A project has at most ${PROJECT_SAVED_BOARDS_MAX} saved boards: delete one nobody uses first. Nothing was changed.`)
  }
}

async function savedBoard(boardId: string): Promise<SavedRow> {
  const row = await prisma.board.findUnique({ where: { id: boardId }, select: SAVED_SELECT })
  if (!row?.view) throw new HttpError(404, BOARD_NOT_FOUND)
  return row
}

/** Saves a view as a new board. A built-in board's kind, with a filter or none, is saved this way too. */
export async function saveBoard(params: {
  projectId: string; name: unknown; kind: unknown; typeId?: unknown; fieldId?: unknown; filter?: unknown
}): Promise<BoardDefinition> {
  const name = checkedName(params.name)
  const spec = await checkedSpec(params.projectId, params)
  await refuseTakenName(params.projectId, name)
  await refuseOverLimit(params.projectId)
  const created = await prisma.board.create({
    data: {
      projectId: params.projectId, name, view: spec.kind, typeId: spec.typeId, fieldId: spec.fieldId,
      filter: spec.filter as Prisma.InputJsonValue,
    },
    select: SAVED_SELECT,
  })
  triggerSnapshotPush()
  return boardDefinition(created)
}

/** Renames a saved board, or saves a changed filter over its own ("Save changes"). */
export async function updateSavedBoard(boardId: string, params: { name?: unknown; filter?: unknown }): Promise<BoardDefinition> {
  const board = await savedBoard(boardId)
  const data: Prisma.BoardUpdateInput = {}
  if (params.name !== undefined) {
    const name = checkedName(params.name)
    await refuseTakenName(board.projectId, name, board.id)
    data.name = name
  }
  if (params.filter !== undefined) data.filter = parseBoardFilter(params.filter) as Prisma.InputJsonValue
  const updated = await prisma.board.update({ where: { id: board.id }, data, select: SAVED_SELECT })
  return boardDefinition(updated)
}

/** A copy of a saved board, named "<name> (copy)", or "(copy 2)" and on when that is taken. */
export async function duplicateSavedBoard(boardId: string): Promise<BoardDefinition> {
  const board = await savedBoard(boardId)
  await refuseOverLimit(board.projectId)
  const names = new Set((await prisma.board.findMany({ where: { projectId: board.projectId, view: { not: null } }, select: { name: true } }))
    .map(b => b.name.toLowerCase()))
  let name = ''
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? ' (copy)' : ` (copy ${n})`
    name = `${board.name.slice(0, BOARD_NAME_MAX_LENGTH - suffix.length)}${suffix}`
    if (!names.has(name.toLowerCase())) break
  }
  const created = await prisma.board.create({
    data: {
      projectId: board.projectId, name, view: board.view, typeId: board.typeId, fieldId: board.fieldId,
      filter: parseBoardFilter(board.filter) as Prisma.InputJsonValue,
    },
    select: SAVED_SELECT,
  })
  return boardDefinition(created)
}

/** Deletes a saved board: only the view goes. */
export async function deleteSavedBoard(boardId: string): Promise<void> {
  const board = await savedBoard(boardId)
  await prisma.$transaction(async (tx) => {
    // A deprecated board path may still have put a task "on" this row; it goes back to Project Tasks, as the old
    // paths expect every task to be on a board. Nothing of the task's place in the plan changes.
    const held = await tx.task.count({ where: { boardId: board.id } })
    if (held > 0) {
      const projectTasks = await ensureProjectTasks(board.projectId, tx)
      await tx.task.updateMany({ where: { boardId: board.id }, data: { boardId: projectTasks } })
    }
    await tx.board.delete({ where: { id: board.id } })
  })
  triggerSnapshotPush()
}
