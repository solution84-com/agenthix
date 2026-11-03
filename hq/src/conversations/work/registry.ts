/**
 * Who owns each kind of operation, and the tools only a conversation's lead has. Each lane fills its own
 * module (workers/, tasks/, toolCalls/); this file only joins them.
 */
import type { OperationKindValue } from '../../shared/conversations/protocol'
import type { ConversationTool, OperationOwner } from '../contract'
import { workerOwner, workerTools } from './workers'
import { taskOwner, taskTools } from './tasks'
import { toolCallOwner, toolCallTools } from './toolCalls'
import { memoryTools } from '../memory'
import { knowledgeTools } from '../memory/leadKnowledgeTools'
import { ledgerTool } from '../long/ledgerTool'
import { zoomTools } from '../long/zoom'
import { placeTools } from '../placesSuggest'
import { offerLivePreviewTool } from '../../livePreviews/offer'

export function operationOwner(kind: OperationKindValue): OperationOwner {
  switch (kind) {
    case 'WORKER': return workerOwner
    case 'TASK': return taskOwner
    case 'TOOL': return toolCallOwner
  }
}

export function conversationTools(): readonly ConversationTool[] {
  return [...workerTools, ...taskTools, ...toolCallTools, ...memoryTools, ...knowledgeTools, ...placeTools, offerLivePreviewTool, ledgerTool, ...zoomTools]
}

export function conversationTool(name: string): ConversationTool | null {
  return conversationTools().find(t => t.name === name) ?? null
}
