/**
 * The registry, reached when called: it lists this folder's tools, so a module here that imported it at load
 * would be loaded half-way through building that list, and the list would hold nothing for its tools.
 */
import type { OperationKindValue } from '../../../shared/conversations/protocol'
import type { ConversationTool, OperationOwner } from '../../contract'

export async function ownerOf(kind: OperationKindValue): Promise<OperationOwner> {
  return (await import('../registry')).operationOwner(kind)
}

export async function toolNamed(name: string): Promise<ConversationTool | null> {
  return (await import('../registry')).conversationTool(name)
}
