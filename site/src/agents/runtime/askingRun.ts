/**
 * What a run may not do once it has asked for something that waits for a person's approval, and once it has stated
 * its result (toolGate.ts applies both). A run that has asked has not done its work yet: it may not state a result,
 * nor change its own task's state, column or type, which would show the work as further on than it is. A run that
 * has stated its result has finished: it asks for nothing more, so an approval never starts work that is done.
 * hq refuses the same task change on its side (`RUN_WAITING_APPROVAL_HEADER`).
 */
import { namesTask } from '@agenthix/core'
import { SYSTEM_MCP_TOOLS } from '../../shared/mcpTools'
import type { RunContext } from './types'

/** What a run waiting for an approval is told when it tries to change its own task's state, column or type. */
export const TASK_MOVE_WHILE_ASKING_TEXT =
  "This run is waiting for a person's approval, so its task stays where it is until what was asked for has run: " +
  'its state, column and type cannot change now. Nothing was changed.'

/** What a run waiting for an approval is told when it tries to state its result. */
export const RESULT_WHILE_ASKING_TEXT =
  "This run is waiting for a person's approval, so its work is not finished and its result cannot be stated yet. In " +
  'your last message, say what is waiting for approval, why it is needed, and what is left to do once it is ' +
  'approved. Nothing was recorded.'

/** What a run that has stated its result is told of a call that would need an approval. */
export const FINISHED_RUN_ASKS_TEXT = (what: string) =>
  `${what} was not run, and is not asked for: this run has stated its result, so its work is finished. End your turn.`

/** Whether the run has asked for something that waits for a person's approval. */
export function runIsAsking(context: Pick<RunContext, 'deferredManifest'>): boolean {
  const asked = context.deferredManifest
  return !!asked && asked.tools.length + asked.bashPatterns.length > 0
}

const PLACE_FIELDS = ['state', 'columnId', 'typeId'] as const

function changesOwnTaskPlace(context: Pick<RunContext, 'ownTask'>, toolName: string, input: Record<string, unknown>): boolean {
  const own = context.ownTask
  if (!own) return false
  if (toolName === SYSTEM_MCP_TOOLS.TASK.UPDATE_TASK) {
    return namesTask(input.taskId, own) && PLACE_FIELDS.some(f => input[f] !== undefined)
  }
  if (toolName === SYSTEM_MCP_TOOLS.TASK.CHANGE_TASKS) {
    return input.state !== undefined && Array.isArray(input.taskIds) && input.taskIds.some(t => namesTask(t, own))
  }
  return false
}

/** Why a run that has asked may not make this call, or null when it may (or has asked for nothing). */
export function refusalWhileAsking(
  context: Pick<RunContext, 'deferredManifest' | 'ownTask'>,
  toolName: string,
  input: unknown,
): { reason: string; blockReason: string } | null {
  if (!runIsAsking(context)) return null
  const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  if (changesOwnTaskPlace(context, toolName, args)) return { reason: TASK_MOVE_WHILE_ASKING_TEXT, blockReason: 'task-move-while-asking' }
  if (toolName === SYSTEM_MCP_TOOLS.RUN.SET_RESULT) return { reason: RESULT_WHILE_ASKING_TEXT, blockReason: 'result-while-asking' }
  return null
}
