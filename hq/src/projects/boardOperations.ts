/**
 * The deprecated board operations the mobile app's client protocol still names (`getProjectBoards`,
 * `moveTaskToBoard`; deprecated since 1.16, they stop working in 3.0). A task is on no board (adr-0176): reading
 * answers from boards as saved views (deprecatedBoardReads.ts), and a move onto a board changes nothing. Each applies
 * the rule the board operations do: reading needs the project visible, and changing needs the person to work in the
 * project (adr-0102).
 */
import { HttpError, prisma } from 'wasp/server'
import type { BoardSummary, MoveTaskToBoardArgs, ProjectBoardsArgs, TaskFields } from '@agenthix/core'
import { requireBoardAccess, requireProjectVisible, requireTaskAccess } from './resourceEntitlement'
import { readProjectBoards } from './deprecatedBoardReads'
import { TASK_KIND_INCLUDE, taskFields } from './taskWire'

type Ctx = { user?: { id: string } | null }

function userOf(context: Ctx): { id: string } {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  return context.user
}

export const getProjectBoards = async ({ projectId }: ProjectBoardsArgs, context: Ctx): Promise<BoardSummary[]> => {
  const user = userOf(context)
  await requireProjectVisible(projectId, user.id)
  return readProjectBoards(projectId)
}

/** A task is on every board of its project that shows it: the move changes nothing, and answers the task as it is. */
export const moveTaskToBoard = async ({ taskId, boardId }: MoveTaskToBoardArgs, context: Ctx): Promise<TaskFields> => {
  const user = userOf(context)
  const projectId = await requireTaskAccess(taskId, user.id, 'Changing this task')
  if ((await requireBoardAccess(boardId, user.id, 'Moving this task onto that board')) !== projectId) {
    throw new HttpError(400, 'A task cannot be placed on a board in another project. Nothing was changed.')
  }
  return taskFields(await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: TASK_KIND_INCLUDE }))
}
