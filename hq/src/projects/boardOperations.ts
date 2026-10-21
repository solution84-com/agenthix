/**
 * The Boards tool's operations beyond a board's own create, change and delete
 * (actions.ts): the boards list, archiving, a task moved to another board,
 * Show also, and a sprint board's sprints (every screen reviewed spec §3,
 * adr-0097). Each applies the rule the existing board operations do: reading
 * needs the project visible, and changing it needs the person to work in the
 * project (adr-0102): a Viewer reads and changes nothing.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Board, Sprint } from 'wasp/entities'
import type { MoveTaskToBoardArgs, ProjectBoardsArgs, TaskFields } from '@agenthix/core'
import { requireBoardAccess, requireBoardVisible, requireProjectVisible, requireTaskAccess } from './resourceEntitlement'
import { archiveBoard as archiveBoardRecord, unarchiveBoard as unarchiveBoardRecord } from './boardService'
import { moveTaskToBoard as moveTaskToBoardRecord } from './taskService'
import { finishSprint as finishSprintRecord, listSprints, renameSprint as renameSprintRecord, requireDestination, type UnfinishedDestination } from './sprintService'
import { readProjectBoards, showAlsoChoice, sprintView, taskCards, type BoardSummary, type SprintView, type TaskCard } from './boardView'
import { taskFields } from './taskWire'

type Ctx = { user?: { id: string } | null }

function userOf(context: Ctx): { id: string } {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export const getProjectBoards = async (
  { projectId, includeArchived }: ProjectBoardsArgs,
  context: Ctx,
): Promise<BoardSummary[]> => {
  const user = userOf(context)
  await requireProjectVisible(projectId, user.id)
  return readProjectBoards(projectId, !!includeArchived)
}

export type ShowAlsoView = {
  /** The boards whose backlogs this person shows beside this one. */
  boardIds: string[]
  /** The project's other boards they may choose, with how many tasks wait in each Backlog. */
  options: Array<{ boardId: string; name: string; backlogCount: number }>
}

export const getBoardShowAlso = async ({ boardId }: { boardId: string }, context: Ctx): Promise<ShowAlsoView> => {
  const user = userOf(context)
  const projectId = await requireBoardVisible(boardId, user.id)
  const [chosen, others] = await Promise.all([
    showAlsoChoice(boardId, projectId, user.id),
    prisma.board.findMany({ where: { projectId, archivedAt: null, id: { not: boardId } }, select: { id: true, name: true, kind: true }, orderBy: { createdAt: 'asc' } }),
  ])
  const counts = await prisma.task.groupBy({
    by: ['boardId'],
    where: { boardId: { in: others.map(b => b.id) }, column: null, archived: false },
    _count: { _all: true },
  })
  const countOf = new Map(counts.map(c => [c.boardId, c._count._all]))
  const ordered = [...others.filter(b => b.kind === 'PROJECT_TASKS'), ...others.filter(b => b.kind !== 'PROJECT_TASKS')]
  return {
    boardIds: chosen.map(b => b.id),
    options: ordered.map(b => ({ boardId: b.id, name: b.name, backlogCount: countOf.get(b.id) ?? 0 })),
  }
}

export const getBoardSprints = async (
  { boardId }: { boardId: string },
  context: Ctx,
): Promise<Array<SprintView & { taskCount: number; doneCount: number }>> => {
  const user = userOf(context)
  await requireBoardVisible(boardId, user.id)
  return (await listSprints(boardId)).map(s => ({ ...sprintView(s), taskCount: s.taskCount, doneCount: s.doneCount }))
}

/** A sprint's record — past ones included: the tasks it holds, done ones among them. */
export const getSprintTasks = async ({ sprintId }: { sprintId: string }, context: Ctx): Promise<TaskCard[]> => {
  const user = userOf(context)
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { boardId: true, board: { select: { projectId: true, project: { select: { key: true } } } } } })
  if (!sprint) throw new HttpError(404, 'Sprint not found')
  await requireBoardVisible(sprint.boardId, user.id, 'Sprint not found')
  return taskCards({ sprintId, projectId: sprint.board.projectId }, sprint.board.project.key)
}

// ── Changes ───────────────────────────────────────────────────────────────────

export const archiveBoard = async ({ boardId }: { boardId: string }, context: Ctx): Promise<Board> => {
  await requireBoardAccess(boardId, userOf(context).id, 'Archiving this board')
  return archiveBoardRecord(boardId)
}

export const unarchiveBoard = async ({ boardId }: { boardId: string }, context: Ctx): Promise<Board> => {
  await requireBoardAccess(boardId, userOf(context).id, 'Unarchiving this board')
  return unarchiveBoardRecord(boardId)
}

/** Into the other board's Backlog: a queued run is withdrawn. */
export const moveTaskToBoard = async ({ taskId, boardId }: MoveTaskToBoardArgs, context: Ctx): Promise<TaskFields> => {
  const user = userOf(context)
  await requireTaskAccess(taskId, user.id, 'Changing this task')
  await requireBoardAccess(boardId, user.id, 'Moving this task onto that board')
  return taskFields(await moveTaskToBoardRecord(taskId, boardId))
}

/** The person's own choice; only the same project's other boards are kept. */
export const setBoardShowAlso = async (
  { boardId, boardIds }: { boardId: string; boardIds: string[] },
  context: Ctx,
): Promise<{ boardIds: string[] }> => {
  const user = userOf(context)
  const projectId = await requireBoardVisible(boardId, user.id)
  if (!Array.isArray(boardIds) || boardIds.some(id => typeof id !== 'string')) throw new HttpError(400, 'boardIds must be a list of board ids')
  const kept = (await prisma.board.findMany({ where: { id: { in: boardIds }, projectId, NOT: { id: boardId } }, select: { id: true } })).map(b => b.id)
  await prisma.boardShowAlso.upsert({
    where: { userId_boardId: { userId: user.id, boardId } },
    create: { userId: user.id, boardId, boardIds: kept },
    update: { boardIds: kept },
  })
  return { boardIds: kept }
}

export const renameSprint = async ({ sprintId, name }: { sprintId: string; name: string | null }, context: Ctx): Promise<Sprint> => {
  const user = userOf(context)
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { boardId: true } })
  if (!sprint) throw new HttpError(404, 'Sprint not found')
  await requireBoardAccess(sprint.boardId, user.id, 'Renaming this sprint')
  return renameSprintRecord(sprintId, name)
}

/** `unfinished` is required, with no default (adr-0097): the next sprint, or the Backlog. */
export const finishSprint = async (
  { boardId, unfinished }: { boardId: string; unfinished: UnfinishedDestination },
  context: Ctx,
): Promise<{ finished: SprintView; next: SprintView; movedTaskIds: string[]; unfinished: UnfinishedDestination }> => {
  const destination = requireDestination(unfinished)
  await requireBoardAccess(boardId, userOf(context).id, 'Finishing this sprint')
  const result = await finishSprintRecord(boardId, destination)
  return { finished: sprintView(result.finished), next: sprintView(result.next), movedTaskIds: result.movedTaskIds, unfinished: result.unfinished }
}
