import { createContext } from 'react'
import type { ConversationPersonView, OperationActivityView } from '../../../shared/conversations/protocol'

/** What a request's card in the thread needs from its conversation: the live requests, and who may answer them. */
export type RequestsView = {
  /** The conversation's live work, from which a waiting request's row is read. */
  rows: OperationActivityView[]
  /** Whether the live work has been read yet: until it has, a card neither offers its buttons nor says it ended. */
  loaded: boolean
  /** Whether the viewer may speak here: no one else answers. */
  canAct: boolean
  busy: boolean
  myId: string | null
  people?: ConversationPersonView[]
  onAnswer: (operationId: string, answer: 'approve' | 'decline', note?: string) => void
}

export const RequestsContext = createContext<RequestsView | null>(null)

/** Whether this viewer may answer a waiting request: they may speak here, and its own kind's check allows them. */
export function mayAnswer(row: OperationActivityView, canAct: boolean): boolean {
  if (!canAct) return false
  const own = row.workflowCard ?? row.mergeCard ?? row.packageCard
  return own ? own.canAnswer : true
}
