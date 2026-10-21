/**
 * The server's half of a closed conversation (adr-0076): the site closes it and
 * replicates the status here, and hq refuses to send into it, so the person is
 * told why before anything is dispatched. What counts as closed, and the words,
 * are shared with the chat page (`shared/closedConversation.ts`).
 */
import { closedBecause, isConversationClosed, START_NEW_CONVERSATION, type ClosedState } from '../shared/closedConversation'

export class SessionClosedError extends Error {
  constructor(reason: string | null) {
    super(`This conversation is closed because ${closedBecause(reason)}. ${START_NEW_CONVERSATION} to keep working with this agent.`)
    this.name = 'SessionClosedError'
  }
}

export const isSessionClosed = isConversationClosed

export function requireOpenSession(session: ClosedState): void {
  if (isConversationClosed(session)) throw new SessionClosedError(session.closedReason ?? null)
}
