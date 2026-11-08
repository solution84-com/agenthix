/**
 * The deprecated reads and moves of a board that owned its tasks (adr-0097), kept while the mobile app's client
 * protocol names them (`getProjectBoards`, `moveTaskToBoard`), and a sprint board's sprints until the project's
 * sprints replace them. Each applies the rule the existing board operations do: reading
 * needs the project visible, and changing it needs the person to work in the
 * project (adr-0102): a Viewer reads and changes nothing.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Board, Sprint } from 'wasp/entities'
import type { MoveTaskToBoardArgs, ProjectBoardsArgs, TaskFields } from '@agenthix/core'
import { requireBoardAccess, requireBoardVisible, requireProjectVisible, requireTaskAccess } from './resourceEntitlement'
import { moveTaskToBoard as moveTaskToBoardRecord } from './taskService'
import { finishSprint as finishSprintRecord, listSprints, renameSprint as renameSprintRecord, requireDestination, type UnfinishedDestination } from './sprintService'
import { readProjectBoards, sprintView, taskCards, type BoardSummary, type SprintView, type TaskCard } from './boardView'
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
  // A project's sprint (boardId null) is read through sprintOperations.ts.
  if (!sprint?.boardId || !sprint.board) throw new HttpError(404, 'Sprint not found')
  await requireBoardVisible(sprint.boardId, user.id, 'Sprint not found')
  return taskCards({ sprintId, projectId: sprint.board.projectId }, sprint.board.project.key)
}

// ── Changes ───────────────────────────────────────────────────────────────────

/** Into the other board's Backlog: a queued run is withdrawn. */
export const moveTaskToBoard = async ({ taskId, boardId }: MoveTaskToBoardArgs, context: Ctx): Promise<TaskFields> => {
  const user = userOf(context)
  await requireTaskAccess(taskId, user.id, 'Changing this task')
  await requireBoardAccess(boardId, user.id, 'Moving this task onto that board')
  return taskFields(await moveTaskToBoardRecord(taskId, boardId))
}

export const renameSprint = async ({ sprintId, name }: { sprintId: string; name: string | null }, context: Ctx): Promise<Sprint> => {
  const user = userOf(context)
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId }, select: { boardId: true } })
  if (!sprint?.boardId) throw new HttpError(404, 'Sprint not found')
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
