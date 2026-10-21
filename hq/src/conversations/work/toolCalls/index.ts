/**
 * The lead's own calls past their turn (conversation layer spec, Approval; Stopping): answer_approval and
 * cancel_operation, and the owner of TOOL operations.
 */
import type { ConversationTool } from '../../contract'
import { answerApprovalTool, cancelOperationTool } from './leadTools'

export const toolCallTools: ConversationTool[] = [answerApprovalTool, cancelOperationTool]
export { toolCallOwner } from './owner'
