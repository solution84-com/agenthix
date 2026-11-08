/**
 * A task type's columns (adr-0174, spec D10): add, rename, recolour, reorder, make a state's default, move to
 * another state, and remove an empty one. Each column sits in one task state; every state keeps at least one column
 * of the type and exactly one default, so a task set to a state always has somewhere to land.
 *
 * The columns of a type are listed in the states' order (all of Backlog's, then To do's, …), and each write keeps
 * them so. Changes that touch tasks (moving a column to another state) run under the project's order lock, the one a
 * task's move takes (taskPlace.ts), so a task moved into the column meanwhile gets the column's new state too.
 */
import { HttpError, prisma } from 'wasp/server'
import { Prisma, type TaskState } from '@prisma/client'
import {
  COLUMN_NAME_MAX_LENGTH, isBoardColour, TASK_STATE_LABELS, TASK_STATES, TYPE_COLUMNS_MAX, type BoardColour, type TaskTypeView,
} from '@agenthix/core'
import { triggerSnapshotPush } from '../server/dashboard/debouncedPush'
import { notifyBoardsOfTasks } from './boardNotify'
import { lockProjectOrder } from './taskPlace'
import { withdrawPendingRun } from './taskRunMoves'
import { listTaskTypes } from './taskTypeService'

type Tx = Prisma.TransactionClient

const stateIndex = (s: TaskState) => TASK_STATES.indexOf(s)

function checkedColumnName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name === '' || name.length > COLUMN_NAME_MAX_LENGTH) {
    throw new HttpError(400, `A column's name is 1 to ${COLUMN_NAME_MAX_LENGTH} characters. Nothing was changed.`)
  }
  return name
}

function checkedColour(raw: unknown): BoardColour {
  if (!isBoardColour(raw)) throw new HttpError(400, 'That colour is not one a column can have. Nothing was changed.')
  return raw
}

async function columnOf(db: Tx | typeof prisma, columnId: string) {
  const column = await db.typeColumn.findUnique({
    where: { id: columnId },
    select: { id: true, typeId: true, name: true, state: true, defaultForState: true, order: true, type: { select: { projectId: true } } },
  })
  if (!column) throw new HttpError(404, 'Column not found')
  return column
}

async function columnsOfType(db: Tx | typeof prisma, typeId: string) {
  return db.typeColumn.findMany({ where: { typeId }, orderBy: { order: 'asc' }, select: { id: true, name: true, state: true, defaultForState: true, order: true } })
}

/** Writes the order of `ids` as 0, 1, 2 …, sorted stably into the states' order. */
async function writeOrder(tx: Tx, columns: Array<{ id: string; state: TaskState }>): Promise<void> {
  const sorted = columns.map((c, i) => ({ ...c, i })).sort((a, b) => stateIndex(a.state) - stateIndex(b.state) || a.i - b.i)
  for (const [order, c] of sorted.entries()) await tx.typeColumn.update({ where: { id: c.id }, data: { order } })
}

async function refuseTakenName(db: Tx | typeof prisma, typeId: string, name: string, exceptId?: string): Promise<void> {
  const taken = await db.typeColumn.findFirst({ where: { typeId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } })
  if (taken) throw new HttpError(409, `This type already has a column named "${name}". Choose another name. Nothing was changed.`)
}

async function typeView(typeId: string): Promise<TaskTypeView> {
  const type = await prisma.taskType.findUniqueOrThrow({ where: { id: typeId }, select: { projectId: true } })
  triggerSnapshotPush()
  return (await listTaskTypes(type.projectId, true)).find(t => t.id === typeId)!
}

/** A new column in `state`, after that state's other columns. Never the state's default: it already has one. */
export async function addTypeColumn(params: { typeId: string; name: unknown; colour?: unknown; state: TaskState }): Promise<TaskTypeView> {
  const name = checkedColumnName(params.name)
  const colour = params.colour === undefined ? 'neutral' : checkedColour(params.colour)
  await prisma.$transaction(async (tx) => {
    const columns = await columnsOfType(tx, params.typeId)
    if (columns.length === 0) throw new HttpError(404, 'Task type not found')
    if (columns.length >= TYPE_COLUMNS_MAX) throw new HttpError(400, `A type has at most ${TYPE_COLUMNS_MAX} columns. Nothing was changed.`)
    await refuseTakenName(tx, params.typeId, name)
    const created = await tx.typeColumn.create({ data: { typeId: params.typeId, name, colour, state: params.state, order: columns.length, defaultForState: false } })
    await writeOrder(tx, [...columns, created])
  })
  return typeView(params.typeId)
}

export async function updateTypeColumn(params: { columnId: string; name?: unknown; colour?: unknown }): Promise<TaskTypeView> {
  const column = await columnOf(prisma, params.columnId)
  const name = params.name === undefined ? undefined : checkedColumnName(params.name)
  const colour = params.colour === undefined ? undefined : checkedColour(params.colour)
  if (name !== undefined) await refuseTakenName(prisma, column.typeId, name, column.id)
  await prisma.typeColumn.update({ where: { id: column.id }, data: { ...(name !== undefined ? { name } : {}), ...(colour !== undefined ? { colour } : {}) } })
    .catch((err: unknown) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new HttpError(409, `This type already has a column named "${name}". Choose another name. Nothing was changed.`)
      }
      throw err
    })
  return typeView(column.typeId)
}

/** `columnIds`: every column of the type, in its new order, keeping the states' order. */
export async function reorderTypeColumns(typeId: string, columnIds: string[]): Promise<TaskTypeView> {
  await prisma.$transaction(async (tx) => {
    const columns = await columnsOfType(tx, typeId)
    const byId = new Map(columns.map(c => [c.id, c]))
    if (columnIds.length !== byId.size || new Set(columnIds).size !== columnIds.length || columnIds.some(id => !byId.has(id))) {
      throw new HttpError(400, "Name every one of the type's columns, each once, in their new order. Nothing was changed.")
    }
    const ordered = columnIds.map(id => byId.get(id)!)
    if (ordered.some((c, i) => i > 0 && stateIndex(c.state) < stateIndex(ordered[i - 1]!.state))) {
      throw new HttpError(400, "A type's columns stay in the states' order: Backlog, To do, In progress, Done. To move a column to another state, use Move to state. Nothing was changed.")
    }
    await writeOrder(tx, ordered)
  })
  return typeView(typeId)
}

/** The state's default column: where a task of the type lands when its state is set directly. */
export async function setDefaultColumn(columnId: string): Promise<TaskTypeView> {
  const column = await columnOf(prisma, columnId)
  await prisma.$transaction([
    // The old default first: one default per state, by the partial unique index.
    prisma.typeColumn.updateMany({ where: { typeId: column.typeId, state: column.state, defaultForState: true, id: { not: column.id } }, data: { defaultForState: false } }),
    prisma.typeColumn.update({ where: { id: column.id }, data: { defaultForState: true } }),
  ])
  return typeView(column.typeId)
}

/** The tasks a column holds: what moving it to another state changes, named in its dialog before the person confirms. */
export async function tasksInColumn(columnId: string) {
  return prisma.task.findMany({
    where: { columnId, archived: false },
    orderBy: [{ rank: 'asc' }, { number: 'asc' }],
    select: { id: true, number: true, title: true, state: true },
  })
}

function stateKeepsAColumn(columns: Array<{ id: string; state: TaskState }>, leaving: { id: string; state: TaskState }): void {
  if (!columns.some(c => c.id !== leaving.id && c.state === leaving.state)) {
    throw new HttpError(400, `${TASK_STATE_LABELS[leaving.state]} needs at least one column of this type: add another first. Nothing was changed.`)
  }
}

/** The state left gets a new default when the column was its default: its first column that remains. */
async function passOnDefault(tx: Tx, columns: Array<{ id: string; state: TaskState; order: number }>, leaving: { id: string; state: TaskState; defaultForState: boolean }) {
  if (!leaving.defaultForState) return
  await tx.typeColumn.update({ where: { id: leaving.id }, data: { defaultForState: false } })
  const heir = columns.filter(c => c.id !== leaving.id && c.state === leaving.state).sort((a, b) => a.order - b.order)[0]!
  await tx.typeColumn.update({ where: { id: heir.id }, data: { defaultForState: true } })
}

/**
 * Moves a column to another state, last among that state's columns, and its tasks with it: each takes the new
 * state. Returns the tasks that changed state. A move into Done takes them out of their agents' lines.
 */
export async function moveColumnToState(columnId: string, state: TaskState) {
  const found = await columnOf(prisma, columnId)
  const result = await prisma.$transaction(async (tx) => {
    await lockProjectOrder(tx, found.type.projectId)
    const column = await columnOf(tx, columnId)
    if (column.state === state) return { typeId: column.typeId, tasks: [] }
    const columns = await columnsOfType(tx, column.typeId)
    stateKeepsAColumn(columns, column)
    await passOnDefault(tx, columns, column)
    await tx.typeColumn.update({ where: { id: column.id }, data: { state } })
    await writeOrder(tx, columns.map(c => (c.id === column.id ? { ...c, state, order: Number.MAX_SAFE_INTEGER } : c)).sort((a, b) => a.order - b.order))
    const tasks = await tx.task.findMany({ where: { columnId }, select: { id: true, number: true, title: true, archived: true, doneAt: true } })
    const done = state === 'DONE'
    await tx.task.updateMany({
      where: { columnId },
      data: { state, ...(done ? {} : { doneAt: null }) },
    })
    if (done) await tx.task.updateMany({ where: { columnId, doneAt: null }, data: { doneAt: new Date() } })
    return { typeId: column.typeId, tasks: tasks.filter(t => !t.archived).map(({ id, number, title }) => ({ id, number, title })) }
  })
  if (state === 'DONE') for (const t of result.tasks) await withdrawPendingRun(t.id)
  if (result.tasks.length > 0) await notifyBoardsOfTasks(result.tasks.map(t => t.id))
  return { type: await typeView(result.typeId), tasks: result.tasks }
}

/** Removes a column that holds no task, archived ones included. Its state keeps another column. */
export async function removeTypeColumn(columnId: string): Promise<TaskTypeView> {
  const found = await columnOf(prisma, columnId)
  await prisma.$transaction(async (tx) => {
    await lockProjectOrder(tx, found.type.projectId)
    const column = await columnOf(tx, columnId)
    const held = await tx.task.count({ where: { columnId } })
    if (held > 0) throw new HttpError(409, `"${column.name}" holds ${held} ${held === 1 ? 'task' : 'tasks'}: move ${held === 1 ? 'it' : 'them'} to another column first. Nothing was changed.`)
    const columns = await columnsOfType(tx, column.typeId)
    stateKeepsAColumn(columns, column)
    await passOnDefault(tx, columns, column)
    await tx.typeColumn.delete({ where: { id: column.id } })
    await writeOrder(tx, columns.filter(c => c.id !== column.id))
  })
  return typeView(found.typeId)
}
