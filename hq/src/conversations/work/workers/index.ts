/**
 * Work in a boundary on the conversation's standing worker there (workers and results spec, Workers): the
 * start_work tool, and the owner of WORKER operations.
 */
import type { ConversationTool, OperationOwner } from '../../contract'
import { startWorkTool } from './startWork'
import { workerOwner as owner } from './owner'

export const workerTools: ConversationTool[] = [startWorkTool]
export const workerOwner: OperationOwner = owner
export { registerWorkerRunListener } from './runEvents'
