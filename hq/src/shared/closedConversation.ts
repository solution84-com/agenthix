/**
 * A closed conversation (adr-0076): its history stays, but the agent can no
 * longer continue it. One place for what counts as closed and what a person is
 * told, read both by the server's refusal to send into one and by the chat
 * page that shows one.
 *
 * Closed is the status or, after a closed conversation has been archived, its
 * reason alone — archiving changes the status but never reopens it.
 */
import type { SessionClosedReasonValue } from '@agenthix/core'

export type ClosedState = { status: string; closedReason?: SessionClosedReasonValue | string | null }

const WHY: Record<SessionClosedReasonValue, string> = {
  HARNESS_STATE_MISSING: "the agent no longer has this conversation's context",
  LEFT_PROJECT: 'you are no longer a member of its project',
  LEFT_ORGANISATION: 'you are no longer a member of the organisation',
  PROJECT_DELETED: 'its project was deleted',
}

export function isConversationClosed(session: ClosedState): boolean {
  return session.status === 'CLOSED' || !!session.closedReason
}

/**
 * Closed only because the harness lost its state. For a conversation whose record is hq's own, that closes nothing:
 * the record has everything, so its worker is started fresh (conversational experience spec, On screen).
 */
export function isHarnessStateLost(session: ClosedState): boolean {
  return isConversationClosed(session) && session.closedReason === 'HARNESS_STATE_MISSING'
}

/** Why it is closed, as the end of a sentence ("… because <this>"). */
export function closedBecause(reason: string | null | undefined): string {
  return WHY[reason as SessionClosedReasonValue] ?? WHY.HARNESS_STATE_MISSING
}

export const START_NEW_CONVERSATION = 'Start a new conversation'

export interface ClosedConversationCopy {
  headline: string
  detail: string
  action: string
}

/** What the chat page says in place of the message box, or null for an open conversation. */
export function closedConversationCopy(session: ClosedState | null | undefined): ClosedConversationCopy | null {
  if (!session || !isConversationClosed(session)) return null
  const why = closedBecause(session.closedReason)
  return {
    headline: 'This conversation is closed',
    detail: `It can no longer continue because ${why}. Its history stays here to read.`,
    action: START_NEW_CONVERSATION,
  }
}
