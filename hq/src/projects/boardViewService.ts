/**
 * Reading one board (adr-0176, spec D3, B1, B4, B5): a saved board by its id, or a built-in or not-yet-saved one by
 * what it is a view of. Its columns, each with its cards in rank order and their count, and how many of the board's
 * tasks the filter shows. Access is the caller's to check (boardViewOperations.ts); this only reads.
 */
import { HttpError, prisma } from 'wasp/server'
import {
  boardDefinitionProblems, isBoardKind, parseBoardFilter, type BoardKind,
} from '@agenthix/core'
import { boardCard, boardRowOf, epicProgressOf, readCards, type BoardCard, type CardRow } from './boardCardService'
import {
  boardColumns, BUILT_IN_BOARDS, groupIntoColumns, isOnBoard, matchesFilter, type BoardColumnDef, type BoardSpec,
} from './boardViewRules'

/** Which board: a saved one, or what a built-in or unsaved one is a view of, in a project. */
export type BoardRef =
  | { boardId: string }
  | { projectId: string; kind: BoardKind; typeId?: string | null; fieldId?: string | null; filter?: unknown }

export type ResolvedBoard = {
  /** The saved board's id; null for a built-in or unsaved one. */
  id: string | null
  projectId: string
  name: string
  builtIn: boolean
  spec: BoardSpec
}

export type BoardRead = {
  board: ResolvedBoard & { readOnly: boolean; typeName: string | null; fieldName: string | null }
  columns: Array<BoardColumnDef & { count: number; cards: BoardCard[] }>
  /** The board's tasks before its filter, and how many the filter shows ("4 of 16 tasks shown"). */
  totalCount: number
  shownCount: number
  /** True when its cards are of more than one type, so each card shows its type's mark. */
  mixesTypes: boolean
  currentSprintId: string | null
}

export const BOARD_NOT_FOUND = 'Board not found'
const ARCHIVED_FIELD_BOARD = 'That field is archived: bring it back to see its board. Nothing was changed.'

/** The project's current sprint: the lowest-numbered not finished (N7). */
export async function currentSprintId(projectId: string): Promise<string | null> {
  const s = await prisma.sprint.findFirst({ where: { projectId, finishedAt: null }, orderBy: { number: 'asc' }, select: { id: true } })
  return s?.id ?? null
}

/** Checks what a board is a view of against its project: a type or field of the project's own, and a field not archived. */
export async function checkedSpec(projectId: string, raw: { kind: unknown; typeId?: unknown; fieldId?: unknown; filter?: unknown }): Promise<BoardSpec> {
  if (!isBoardKind(raw.kind)) throw new HttpError(400, 'A board shows a type\'s columns (TYPE), the task state (STATE), the execution state (EXECUTION) or a field (FIELD). Nothing was changed.')
  const typeId = typeof raw.typeId === 'string' && raw.typeId !== '' ? raw.typeId : null
  const fieldId = typeof raw.fieldId === 'string' && raw.fieldId !== '' ? raw.fieldId : null
  const problems = boardDefinitionProblems({ kind: raw.kind, typeId, fieldId })
  if (problems.length > 0) throw new HttpError(400, `${problems.join(' ')} Nothing was changed.`)
  if (typeId) {
    const type = await prisma.taskType.findUnique({ where: { id: typeId }, select: { projectId: true } })
    if (!type || type.projectId !== projectId) throw new HttpError(400, "That task type is not one of this project's. Nothing was changed.")
  }
  if (fieldId) {
    const field = await prisma.customField.findUnique({ where: { id: fieldId }, select: { projectId: true, archivedAt: true } })
    if (!field || field.projectId !== projectId) throw new HttpError(400, "That field is not one of this project's. Nothing was changed.")
    if (field.archivedAt) throw new HttpError(400, ARCHIVED_FIELD_BOARD)
  }
  return { kind: raw.kind, typeId, fieldId, filter: parseBoardFilter(raw.filter) }
}

/** The name a view goes by before it is saved: the built-in board's, or what it shows. */
async function viewName(spec: BoardSpec): Promise<string> {
  const builtIn = BUILT_IN_BOARDS.find(b => b.kind === spec.kind)
  if (builtIn) return builtIn.name
  if (spec.typeId) {
    const type = await prisma.taskType.findUnique({ where: { id: spec.typeId }, select: { name: true } })
    return `${type?.name ?? 'Type'}'s columns`
  }
  const field = await prisma.customField.findUnique({ where: { id: spec.fieldId! }, select: { name: true } })
  return field?.name ?? 'Field'
}

export async function resolveBoard(ref: BoardRef): Promise<ResolvedBoard> {
  if ('boardId' in ref) {
    const row = await prisma.board.findUnique({
      where: { id: ref.boardId },
      select: { id: true, projectId: true, name: true, view: true, typeId: true, fieldId: true, filter: true },
    })
    if (!row) throw new HttpError(404, BOARD_NOT_FOUND)
    return {
      id: row.id, projectId: row.projectId, name: row.name, builtIn: false,
      spec: { kind: row.view, typeId: row.typeId, fieldId: row.fieldId, filter: parseBoardFilter(row.filter) },
    }
  }
  const spec = await checkedSpec(ref.projectId, ref)
  return { id: null, projectId: ref.projectId, name: await viewName(spec), builtIn: spec.kind === 'STATE' || spec.kind === 'EXECUTION', spec }
}

/** What a board's columns are drawn from: its type's columns, or its field's options. */
export async function columnsOf(spec: BoardSpec): Promise<{ columns: BoardColumnDef[]; typeName: string | null; fieldName: string | null }> {
  if (spec.kind === 'TYPE') {
    const type = await prisma.taskType.findUnique({
      where: { id: spec.typeId! },
      select: { name: true, columns: { select: { id: true, name: true, colour: true, state: true }, orderBy: { order: 'asc' } } },
    })
    if (!type) throw new HttpError(404, BOARD_NOT_FOUND)
    return { columns: boardColumns('TYPE', { typeColumns: type.columns }), typeName: type.name, fieldName: null }
  }
  if (spec.kind === 'FIELD') {
    const field = await prisma.customField.findUnique({
      where: { id: spec.fieldId! },
      select: { name: true, archivedAt: true, options: { select: { id: true, name: true, colour: true }, orderBy: { order: 'asc' } } },
    })
    if (!field) throw new HttpError(404, BOARD_NOT_FOUND)
    if (field.archivedAt) throw new HttpError(400, ARCHIVED_FIELD_BOARD)
    return { columns: boardColumns('FIELD', { options: field.options }), typeName: null, fieldName: field.name }
  }
  return { columns: boardColumns(spec.kind, {}), typeName: null, fieldName: null }
}

/** Each task's value in one field: task id → option id. */
export async function fieldValuesOf(fieldId: string, taskIds?: string[]): Promise<Map<string, string>> {
  const values = await prisma.taskFieldValue.findMany({
    where: { fieldId, ...(taskIds ? { taskId: { in: taskIds } } : {}) },
    select: { taskId: true, optionId: true },
  })
  return new Map(values.map(v => [v.taskId, v.optionId]))
}

/** The board's tasks, before its filter, in rank order, each with its row for the rules. */
export async function boardTasks(projectId: string, spec: BoardSpec): Promise<Array<{ card: CardRow; row: ReturnType<typeof boardRowOf> }>> {
  const cards = await readCards({ projectId, ...(spec.kind === 'TYPE' ? { typeId: spec.typeId } : {}) })
  const values = spec.kind === 'FIELD' ? await fieldValuesOf(spec.fieldId!) : null
  return cards
    .map(card => ({ card, row: boardRowOf(card, values ? (values.get(card.id) ?? null) : undefined) }))
    .filter(({ row }) => isOnBoard(spec, row))
}

export async function readBoard(ref: BoardRef): Promise<BoardRead> {
  const board = await resolveBoard(ref)
  const { spec } = board
  const [{ columns, typeName, fieldName }, tasks, sprintId] = await Promise.all([
    columnsOf(spec), boardTasks(board.projectId, spec), currentSprintId(board.projectId),
  ])
  const shown = tasks.filter(t => matchesFilter(spec.filter, t.row, sprintId))
  const grouped = groupIntoColumns(spec.kind, columns, shown.map(t => ({ ...t.row, card: t.card })))
  const progress = await epicProgressOf(shown.filter(t => t.row.typeKind === 'EPIC').map(t => t.card.id))
  const drawn = columns.map(c => {
    const inColumn = grouped.get(c.key) ?? []
    return {
      ...c, count: inColumn.length,
      cards: inColumn.map(t => {
        const card = boardCard(t.card)
        const epic = progress.get(card.id)
        return epic ? { ...card, epicProgress: epic } : card
      }),
    }
  })
  return {
    board: { ...board, readOnly: spec.kind === 'EXECUTION', typeName, fieldName },
    columns: drawn,
    totalCount: tasks.length,
    shownCount: drawn.reduce((n, c) => n + c.count, 0),
    mixesTypes: new Set(shown.map(t => t.row.typeId)).size > 1,
    currentSprintId: sprintId,
  }
}
