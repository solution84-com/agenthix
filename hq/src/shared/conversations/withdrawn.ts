import type { ConversationMessageView } from './protocol'

/**
 * A reply withdrawn before the person heard any of it, because their next words joined the message it answered
 * (adaptive voice spec, Orchestration: the person speaks again before the reply is heard), and that made nothing:
 * to them it never happened, so it is not shown and the lead does not read it. One that did make something stays.
 * So does an encouragement response (Orchestration §5), once their words joined their message.
 */
export function unseenWithdrawn(message: ConversationMessageView): boolean {
  if (!message.withdrawn || message.kind !== 'TEXT') return false
  // An encouragement response the person went on after: the turn that answers is told of it, and it is not shown.
  if (message.encouragement) return true
  return !message.body.text.trim() && !(message.body.thinking?.steps ?? []).some(s => s.made)
}
