/**
 * list_tasks — a project's tasks in its one order (rank, spec D14), the order an agent's Start follows, as the board
 * cards show them (boardCardService.ts). One project at a time, which the caller must be able to see; a run confined
 * to its project reaches only that one (requireProjectEntitlement checks both).
 */
import { prisma } from 'wasp/server'
import type { Prisma, TaskState, TaskExecutionState } from '@prisma/client'
import { LIST_TASKS_MAX } from '@agenthix/core'
import type { CallerContext } from './types'
import { ControlPlaneError } from './types'
import { requireProjectEntitlement } from './authorize'
import { CARD_SELECT, RANK_ORDER } from '../../projects/boardCardService'
import { currentSprintId } from '../../projects/boardViewService'
import { optionalTaskIdOf, toolTask } from './taskToolShapes'

interface ListTasksArgs {
  projectId: string
  typeId?: string
  state?: TaskState
  executionState?: TaskExecutionState
  /** A sprint's id, or "current". */
  sprintId?: string
  epicId?: string
  assignedAgentId?: string
  optionId?: string
  includeArchived?: boolean
  limit?: number
}

const DEFAULT_LIMIT = 50

export async function listTasksOp(ctx: CallerContext, args: ListTasksArgs) {
  if (typeof args.projectId !== 'string' || !args.projectId) {
    throw new ControlPlaneError('invalid', 'Name the project, by its key or id: list_projects lists them')
  }
  await requireProjectEntitlement(ctx, args.projectId, 'list_tasks', 'read')
  const where: Prisma.TaskWhereInput = { projectId: args.projectId }
  if (!args.includeArchived) where.archived = false
  if (args.typeId) where.typeId = args.typeId
  if (args.state) where.state = args.state
  if (args.executionState) where.executionState = args.executionState
  if (args.assignedAgentId) where.assignedAgentId = args.assignedAgentId
  if (args.optionId) where.fieldValues = { some: { optionId: args.optionId } }
  if (args.epicId) where.epicId = (await optionalTaskIdOf(args.epicId)) ?? undefined
  if (args.sprintId === 'current') {
    const current = await currentSprintId(args.projectId)
    if (!current) return { tasks: [], total: 0, note: 'This project has no current sprint.' }
    where.sprintId = current
  } else if (args.sprintId) where.sprintId = args.sprintId

  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), LIST_TASKS_MAX)
  const [rows, total] = await Promise.all([
    prisma.task.findMany({ where, select: CARD_SELECT, orderBy: RANK_ORDER, take: limit }),
    prisma.task.count({ where }),
  ])
  return { tasks: rows.map(toolTask), total, ...(total > rows.length ? { note: `The first ${rows.length} of ${total}, in the project's order` } : {}) }
}
