/**
 * A project's boards for the Boards list (adr-0176, spec BS1, N5): the two built-in boards first, then every saved
 * board, each with its spread across its columns, how many of its tasks need the person, and when a card on it last
 * changed column, so a board nobody uses stands out. Saved boards are the project's only: everyone in it sees them.
 * Access is the caller's to check; this only reads.
 */
import { prisma } from 'wasp/server'
import { parseBoardFilter, type BoardColour, type BoardFilter, type BoardKind, type TaskState } from '@agenthix/core'
import { boardRowOf, CARD_SELECT, RANK_ORDER } from './boardCardService'
import {
  boardColumns, BUILT_IN_BOARDS, columnKeyOf, isOnBoard, matchesFilter, rowNeedsYou, type BoardColumnDef, type BoardSpec,
  type BoardTaskRow,
} from './boardViewRules'
import { currentSprintId } from './boardViewService'

export type BoardListEntry = {
  /** A saved board's id; null for a built-in one, which is opened by its `key`. */
  id: string | null
  /** "state" or "execution" for a built-in board; a saved board's id. */
  key: string
  name: string
  builtIn: boolean
  kind: BoardKind
  typeId: string | null
  fieldId: string | null
  /** The type or field it shows, to say so in words ("Bug's columns", "Launch stage · a field"). */
  typeName: string | null
  fieldName: string | null
  filter: BoardFilter
  /** Each column with its count; `state` is the task state a type's or the state board's column sits in. */
  spread: Array<{ key: string; name: string; colour: BoardColour; count: number; state: TaskState | null }>
  needsYouCount: number
  /** When a card on it last changed column, or value on a field board; null when none has, and on the execution board. */
  lastMovedAt: Date | null
}

type Row = BoardTaskRow & { movedAt: Date | null }

export async function listBoards(projectId: string): Promise<BoardListEntry[]> {
  const [saved, types, fields, cards, values, moves, sprintId] = await Promise.all([
    prisma.board.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, view: true, typeId: true, fieldId: true, filter: true },
    }),
    prisma.taskType.findMany({
      where: { projectId },
      select: { id: true, name: true, columns: { select: { id: true, name: true, colour: true, state: true }, orderBy: { order: 'asc' } } },
    }),
    prisma.customField.findMany({
      where: { projectId },
      select: { id: true, name: true, archivedAt: true, options: { select: { id: true, name: true, colour: true }, orderBy: { order: 'asc' } } },
    }),
    prisma.task.findMany({ where: { projectId, archived: false }, select: CARD_SELECT, orderBy: RANK_ORDER }),
    prisma.taskFieldValue.findMany({ where: { field: { projectId } }, select: { taskId: true, fieldId: true, optionId: true, updatedAt: true } }),
    prisma.taskActivity.groupBy({ by: ['taskId'], where: { kind: 'MOVED', task: { projectId } }, _max: { createdAt: true } }),
    currentSprintId(projectId),
  ])
  const movedAt = new Map(moves.map(m => [m.taskId, m._max.createdAt]))
  const valueOf = new Map(values.map(v => [`${v.fieldId}:${v.taskId}`, v]))
  const rows: Row[] = cards.map(c => ({ ...boardRowOf(c), movedAt: movedAt.get(c.id) ?? null }))
  const typeOf = new Map(types.map(t => [t.id, t]))
  const fieldOf = new Map(fields.map(f => [f.id, f]))

  function entry(base: Pick<BoardListEntry, 'id' | 'key' | 'name' | 'builtIn'>, spec: BoardSpec): BoardListEntry {
    const type = spec.typeId ? typeOf.get(spec.typeId) : undefined
    const field = spec.fieldId ? fieldOf.get(spec.fieldId) : undefined
    const columns: BoardColumnDef[] = boardColumns(spec.kind, { typeColumns: type?.columns, options: field?.options })
    const counts = new Map(columns.map(c => [c.key, 0]))
    let needsYouCount = 0
    let lastMovedAt: Date | null = null
    for (const r of rows) {
      const value = field ? valueOf.get(`${field.id}:${r.id}`) : undefined
      const row = field ? { ...r, optionId: value?.optionId ?? null } : r
      if (!isOnBoard(spec, row) || !matchesFilter(spec.filter, row, sprintId)) continue
      const key = columnKeyOf(spec.kind, row)
      if (key !== null && counts.has(key)) counts.set(key, counts.get(key)! + 1)
      if (rowNeedsYou(row)) needsYouCount++
      const moved = spec.kind === 'EXECUTION' ? null : field ? (value?.updatedAt ?? null) : row.movedAt
      if (moved && (!lastMovedAt || moved > lastMovedAt)) lastMovedAt = moved
    }
    return {
      ...base, kind: spec.kind, typeId: spec.typeId, fieldId: spec.fieldId, filter: spec.filter,
      typeName: type?.name ?? null, fieldName: field?.name ?? null,
      spread: columns.map(c => ({ key: c.key, name: c.name, colour: c.colour, count: counts.get(c.key) ?? 0, state: c.state })),
      needsYouCount, lastMovedAt,
    }
  }

  const builtIn = BUILT_IN_BOARDS.map(b => entry(
    { id: null, key: b.key, name: b.name, builtIn: true },
    { kind: b.kind, typeId: null, fieldId: null, filter: {} },
  ))
  const savedEntries = saved
    // A board of an archived field is hidden with its field, and back with it.
    .filter(b => !(b.fieldId && fieldOf.get(b.fieldId)?.archivedAt))
    .map(b => entry(
      { id: b.id, key: b.id, name: b.name, builtIn: false },
      { kind: b.view, typeId: b.typeId, fieldId: b.fieldId, filter: parseBoardFilter(b.filter) },
    ))
  return [...builtIn, ...savedEntries]
}
