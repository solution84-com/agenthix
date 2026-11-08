/**
 * Board and sprint operations — control-plane service layer. See taskOps.ts's header for the shared conventions.
 *
 * A board is a saved view of a project's tasks (adr-0176): two are built in (STATE, EXECUTION) and any other is
 * saved by someone who works in the project. A board holds no task, so an agent moves a card by changing the task
 * (update_task). A sprint is the project's (spec D8, D13): one series, finished only explicitly (N7), saying where
 * the tasks not done go. Each call goes through the services the Boards and Sprints screens use, as the person the
 * call is for.
 */
import { prisma } from 'wasp/server'
import type { BoardKind } from '@agenthix/core'
import { ControlPlaneError, type CallerContext } from './types'
import { requireProjectEntitlement, type ProjectUse } from './authorize'
import { callerActor } from './runOnBehalfOf'
import { asControlPlane } from './asControlPlane'
import { optionalTaskIdOf, toolTaskOfCard } from './taskToolShapes'
import { listBoards } from '../../projects/boardListService'
import { BOARD_NOT_FOUND, currentSprintId, readBoard, type BoardRef } from '../../projects/boardViewService'
import { saveBoard } from '../../projects/boardSaveService'
import { listTaskTypes } from '../../projects/taskTypeService'
import { listCustomFields } from '../../projects/fieldService'
import { readProjectSprints, type SprintSummary } from '../../projects/projectSprintView'
import { finishProjectSprint, sprintOf, unfinishedGoTo, updateProjectSprint } from '../../projects/projectSprintService'
import { sprintTitle } from '../../projects/sprintSeries'

export { asControlPlane } from './asControlPlane'

const day = (d: Date) => d.toISOString().slice(0, 10)

function sprintOut(s: Pick<SprintSummary, 'id' | 'number' | 'name' | 'startDate' | 'finishDate' | 'finishedAt'>) {
  return { sprintId: s.id, number: s.number, title: sprintTitle(s), startDate: day(s.startDate), lastDay: day(s.finishDate), finished: s.finishedAt !== null }
}

// ── list_boards ───────────────────────────────────────────────────────────────

export async function listBoardsOp(ctx: CallerContext, args: { projectId: string }) {
  await requireProjectEntitlement(ctx, args.projectId, 'list_boards', 'read')
  const [boards, types, fields, sprints] = await Promise.all([
    listBoards(args.projectId),
    listTaskTypes(args.projectId),
    listCustomFields(args.projectId),
    readProjectSprints(args.projectId),
  ])
  return {
    boards: boards.map(b => ({
      boardId: b.id, kind: b.kind, name: b.name, builtIn: b.builtIn,
      ...(b.typeId ? { typeId: b.typeId } : {}), ...(b.fieldId ? { fieldId: b.fieldId } : {}),
      ...(Object.keys(b.filter).length > 0 ? { filter: b.filter } : {}),
      columns: b.spread.map(c => ({ name: c.name, tasks: c.count })),
    })),
    types: types.map(t => ({
      typeId: t.id, name: t.name, kind: t.kind,
      columns: t.columns.map(c => ({ columnId: c.id, name: c.name, state: c.state, ...(c.defaultForState ? { defaultForState: true } : {}) })),
    })),
    fields: fields.map(f => ({ fieldId: f.id, name: f.name, options: f.options.map(o => ({ optionId: o.id, name: o.name })) })),
    sprints: {
      current: sprints.current ? { ...sprintOut(sprints.current), daysLeft: sprints.current.daysLeft, daysOverdue: sprints.current.daysOverdue } : null,
      upcoming: sprints.upcoming.map(sprintOut),
      lengthDays: sprints.lengthDays,
    },
  }
}

// ── get_board ─────────────────────────────────────────────────────────────────

export type BoardToolArgs = { projectId: string; boardId?: string; kind?: 'STATE' | 'EXECUTION' }

/** Which board the arguments name, checked to be in the project the caller names and may reach. */
async function boardRefOf(ctx: CallerContext, args: BoardToolArgs, what: string, use: ProjectUse): Promise<BoardRef> {
  await requireProjectEntitlement(ctx, args.projectId, what, use)
  if (args.boardId) {
    const board = await prisma.board.findUnique({ where: { id: args.boardId }, select: { projectId: true, view: true } })
    // A board of another project reads as no board at all.
    if (!board?.view || board.projectId !== args.projectId) throw new ControlPlaneError('not_found', `${BOARD_NOT_FOUND}: list_boards lists this project's boards`)
    return { boardId: args.boardId }
  }
  if (args.kind !== 'STATE' && args.kind !== 'EXECUTION') {
    throw new ControlPlaneError('invalid', 'Name a saved board by its boardId, or a built-in one by kind: STATE or EXECUTION')
  }
  return { projectId: args.projectId, kind: args.kind as BoardKind }
}

/** A board read as a tool answers it: its columns in order, each with its tasks in the project's order. */
export async function readBoardForTool(ctx: CallerContext, args: BoardToolArgs, what: string) {
  const ref = await boardRefOf(ctx, args, what, 'read')
  const read = await asControlPlane(() => readBoard(ref))
  return {
    board: {
      boardId: read.board.id, name: read.board.name, kind: read.board.spec.kind, builtIn: read.board.builtIn,
      ...(read.board.typeName ? { type: read.board.typeName } : {}), ...(read.board.fieldName ? { field: read.board.fieldName } : {}),
      ...(Object.keys(read.board.spec.filter).length > 0 ? { filter: read.board.spec.filter } : {}),
      // What dropping a card here would change, so the agent knows which update_task argument moves it.
      moves: read.board.readOnly ? 'nothing: it shows what agents are doing' : read.board.spec.kind === 'FIELD' ? 'the field value' : read.board.spec.kind === 'TYPE' ? 'the column' : 'the task state',
    },
    columns: read.columns.map(c => ({
      key: c.key, name: c.name, ...(c.state ? { state: c.state } : {}), count: c.count,
      tasks: c.cards.map(toolTaskOfCard),
    })),
    shown: read.shownCount, total: read.totalCount,
  }
}

export async function getBoardOp(ctx: CallerContext, args: BoardToolArgs) {
  return readBoardForTool(ctx, args, 'get_board')
}

// ── create_board ──────────────────────────────────────────────────────────────

interface CreateBoardArgs {
  projectId: string
  name: string
  kind: BoardKind
  typeId?: string
  fieldId?: string
  sprintId?: string
  epicId?: string
  agentId?: string
}

// The browser's rule (boardViewOperations.ts): someone who works in the project may save a board (spec Q9).
export async function createBoardOp(ctx: CallerContext, args: CreateBoardArgs) {
  await requireProjectEntitlement(ctx, args.projectId, 'create_board', 'work')
  const epicId = await optionalTaskIdOf(args.epicId)
  const filter = {
    ...(args.sprintId ? { sprint: args.sprintId === 'current' ? { current: true as const } : { sprintId: args.sprintId } } : {}),
    ...(epicId ? { epicId } : {}),
    ...(args.agentId ? { agentId: args.agentId } : {}),
  }
  const board = await asControlPlane(() => saveBoard({
    projectId: args.projectId, name: args.name, kind: args.kind, typeId: args.typeId ?? null, fieldId: args.fieldId ?? null, filter,
  }))
  return { success: true, boardId: board.id, name: board.name, kind: board.kind, message: `Board '${board.name}' saved` }
}

// ── finish_sprint / rename_sprint ─────────────────────────────────────────────

export async function finishSprintOp(ctx: CallerContext, args: { projectId: string; unfinished?: string }) {
  await requireProjectEntitlement(ctx, args.projectId, 'finish_sprint', 'work')
  const unfinished = await asControlPlane(async () => unfinishedGoTo(args.unfinished))
  const current = await currentSprintId(args.projectId)
  if (!current) throw new ControlPlaneError('invalid', 'This project has no sprint to finish: a person starts its sprints on its Sprints page. Nothing was changed.')
  const result = await asControlPlane(() => finishProjectSprint(current, unfinished, callerActor(ctx)))
  return {
    success: true,
    finished: sprintOut(result.finished),
    current: sprintOut(result.next),
    unfinished: result.unfinished,
    movedTaskIds: result.movedTaskIds,
  }
}

export async function renameSprintOp(ctx: CallerContext, args: { sprintId: string; name: string | null }) {
  const sprint = await asControlPlane(() => sprintOf(args.sprintId))
  await requireProjectEntitlement(ctx, sprint.projectId, 'rename_sprint', 'work')
  const renamed = await asControlPlane(() => updateProjectSprint(args.sprintId, { name: args.name }))
  return { success: true, sprint: sprintOut(renamed) }
}
