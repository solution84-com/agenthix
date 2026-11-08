/**
 * The operations over boards as saved views (adr-0176): the project's boards, one board read, a drop on one, and
 * saving, changing, copying and deleting a saved board. Anyone who may work in the project may save and change
 * boards and drop cards (spec Q9); anyone who can see it may read them. A board is named by its id when saved, or by
 * what it is a view of (`projectId`, `kind`, `typeId` or `fieldId`, `filter`) when built in or not yet saved. Each
 * argument is checked here, since Wasp hands an operation whatever the request carried.
 */
import { HttpError, prisma } from 'wasp/server'
import type { BoardDefinition, BoardKind } from '@agenthix/core'
import { requireMayWorkInProject } from './membership'
import { requireProjectVisible } from './resourceEntitlement'
import { personActor } from './taskActivity'
import type { BoardCard } from './boardCardService'
import { dropOnBoard as dropOnBoardRecord } from './boardDropService'
import { listBoards, type BoardListEntry } from './boardListService'
import { deleteSavedBoard, duplicateSavedBoard, saveBoard as saveBoardRecord, updateSavedBoard } from './boardSaveService'
import { BOARD_NOT_FOUND, readBoard, type BoardRead, type BoardRef } from './boardViewService'
import { readBoardChoices, type BoardChoices } from './boardChoices'
import { readBoardViewsAcrossProjects, type ProjectBoards } from './boardViewsAcrossProjects'

type Ctx = { user?: { id: string } | null }

function userOf(context: Ctx): { id: string } {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') throw new HttpError(400, `${what} is required`)
  return value
}

const optionalText = (value: unknown, what: string): string | undefined => (value === undefined || value === null ? undefined : text(value, what))

/** Which board: `boardId` for a saved one; otherwise what it is a view of. */
export type BoardArgs = {
  boardId?: string
  projectId?: string
  kind?: BoardKind
  typeId?: string | null
  fieldId?: string | null
  filter?: unknown
}

function refOf(args: BoardArgs): BoardRef {
  if (args.boardId !== undefined) return { boardId: text(args.boardId, 'A board id') }
  return { projectId: text(args.projectId, 'A project id'), kind: args.kind as BoardKind, typeId: args.typeId, fieldId: args.fieldId, filter: args.filter }
}

async function projectOfRef(ref: BoardRef): Promise<string> {
  if (!('boardId' in ref)) return ref.projectId
  const board = await prisma.board.findUnique({ where: { id: ref.boardId }, select: { projectId: true } })
  if (!board) throw new HttpError(404, BOARD_NOT_FOUND)
  return board.projectId
}

async function projectOfSaved(boardId: string): Promise<string> {
  return projectOfRef({ boardId: text(boardId, 'A board id') })
}

const CHANGING_BOARDS = "Changing this project's boards"

// ── Reads ──

export const getBoardViews = async (args: { projectId: string }, context: Ctx): Promise<BoardListEntry[]> => {
  const user = userOf(context)
  const projectId = text(args.projectId, 'A project id')
  await requireProjectVisible(projectId, user.id)
  return listBoards(projectId)
}

/** Every board of every project the person is in, for Boards in the rail. */
export const getBoardViewsAcrossProjects = async (_args: void, context: Ctx): Promise<ProjectBoards[]> => {
  return readBoardViewsAcrossProjects(userOf(context).id)
}

/** What a board's Columns menu and filters choose from. */
export const getBoardChoices = async (args: { projectId: string }, context: Ctx): Promise<BoardChoices> => {
  const user = userOf(context)
  const projectId = text(args.projectId, 'A project id')
  await requireProjectVisible(projectId, user.id)
  return readBoardChoices(projectId)
}

export const getBoardView = async (args: BoardArgs, context: Ctx): Promise<BoardRead> => {
  const user = userOf(context)
  const ref = refOf(args)
  await requireProjectVisible(await projectOfRef(ref), user.id, BOARD_NOT_FOUND)
  return readBoard(ref)
}

// ── A drop ──

export type DropOnBoardArgs = BoardArgs & { taskId: string; column: string; afterTaskId?: string | null; beforeTaskId?: string | null }

/** Drops a card on a board's column, after (or before) the visible card next to it. */
export const dropOnBoard = async (args: DropOnBoardArgs, context: Ctx): Promise<BoardCard> => {
  const user = userOf(context)
  const ref = refOf(args)
  await requireMayWorkInProject(await projectOfRef(ref), user.id, 'Moving this task')
  return dropOnBoardRecord(ref, {
    taskId: text(args.taskId, 'A task id'),
    column: text(args.column, 'A column'),
    afterTaskId: optionalText(args.afterTaskId, 'afterTaskId'),
    beforeTaskId: optionalText(args.beforeTaskId, 'beforeTaskId'),
  }, personActor(user.id))
}

// ── Saved boards ──

export const saveBoardView = async (
  args: { projectId: string; name: string; kind: BoardKind; typeId?: string | null; fieldId?: string | null; filter?: unknown },
  context: Ctx,
): Promise<BoardDefinition> => {
  const user = userOf(context)
  const projectId = text(args.projectId, 'A project id')
  await requireMayWorkInProject(projectId, user.id, CHANGING_BOARDS)
  return saveBoardRecord({ projectId, name: args.name, kind: args.kind, typeId: args.typeId, fieldId: args.fieldId, filter: args.filter })
}

export const updateBoardView = async (args: { boardId: string; name?: string; filter?: unknown }, context: Ctx): Promise<BoardDefinition> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfSaved(args.boardId), user.id, CHANGING_BOARDS)
  return updateSavedBoard(args.boardId, { name: args.name, filter: args.filter })
}

export const duplicateBoardView = async (args: { boardId: string }, context: Ctx): Promise<BoardDefinition> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfSaved(args.boardId), user.id, CHANGING_BOARDS)
  return duplicateSavedBoard(args.boardId)
}

export const deleteBoardView = async (args: { boardId: string }, context: Ctx): Promise<void> => {
  const user = userOf(context)
  await requireMayWorkInProject(await projectOfSaved(args.boardId), user.id, CHANGING_BOARDS)
  await deleteSavedBoard(args.boardId)
}
