/**
 * Tasks a conversation asks for (workers and results spec, Results): run_task and create_task as a turn's
 * operation-returning tools, the owner of TASK operations, and the listener that follows their runs.
 */
import type { ConversationTool } from '../../contract'
import { runTaskTool } from './runTaskTool'
import { createTaskTool } from './createTaskTool'

export const taskTools: ConversationTool[] = [runTaskTool, createTaskTool]
export { taskOwner } from './owner'
export { registerTaskOperationListener } from './runListener'
