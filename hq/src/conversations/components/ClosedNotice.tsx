import type { Refusal } from '@agenthix/ui/primitives'
import { closedNotice } from '../closedCopy'
import type { ConversationStatusValue } from '../../shared/conversations/protocol'

/** Why the message box of a closed conversation is greyed, and the way to start a new one with the same agent. */
export function closedRefusal(status: ConversationStatusValue, reason: string | null, startNew: () => void): Refusal | null {
  const notice = closedNotice(status, reason)
  if (!notice) return null
  return {
    reason: notice.headline,
    title: notice.headline,
    detail: notice.detail,
    actions: [{ label: 'Start a new conversation with this agent', onClick: startNew, variant: 'primary' }],
  }
}
