/**
 * Tasks a conversation asks for (workers and results spec, Results): run_task and create_task as a turn's
 * operation-returning tools, open_board to show the person a board, the owner of TASK operations, and the listener
 * that follows their runs.
 */
import type { ConversationTool } from '../../contract'
import { runTaskTool } from './runTaskTool'
import { createTaskTool } from './createTaskTool'
import { openBoardTool } from './openBoardTool'

export const taskTools: ConversationTool[] = [runTaskTool, createTaskTool, openBoardTool]
export { taskOwner } from './owner'
export { registerTaskOperationListener } from './runListener'
