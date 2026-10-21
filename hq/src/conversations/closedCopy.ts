import type { ConversationStatusValue } from '../shared/conversations/protocol'

const WHY: Record<string, string> = {
  LEFT_PROJECT: 'you are no longer a member of its project',
  LEFT_ORGANISATION: 'you are no longer a member of the organisation',
  PROJECT_DELETED: 'its project was deleted',
  TASK_DELETED: 'its task was deleted',
}

/** The words that stand in place of the message box, or null for a conversation that is not closed. */
export function closedNotice(status: ConversationStatusValue, reason: string | null): { headline: string; detail: string } | null {
  if (status !== 'CLOSED') return null
  return {
    headline: 'This conversation is closed',
    detail: reason && WHY[reason]
      ? `It can no longer continue because ${WHY[reason]}. What was said stays here to read.`
      : 'It can no longer continue. What was said stays here to read.',
  }
}

/** A list row's mark for a closed conversation: "Closed · its project was deleted". */
export function closedMark(reason: string | null): string {
  return reason && WHY[reason] ? `Closed · ${WHY[reason]}` : 'Closed'
}
