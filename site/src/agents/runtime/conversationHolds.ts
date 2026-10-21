/**
 * Whether something outside any turn still needs a conversation's processes —
 * a preview held open for it (spec §3). The conversation's idle timer
 * (conversationLifecycle.ts) asks before it releases the conversation.
 *
 * A seam of its own with no imports, like containerDestroyed.ts: the preview
 * registry reports its holds here, so it need not import the runtime, and the
 * runtime need not import it.
 */
export type ConversationHold = (conversationId: string) => boolean

const holds: ConversationHold[] = []

export function addConversationHold(hold: ConversationHold): void {
  holds.push(hold)
}

/** A hold that throws is read as no hold: it must not keep a conversation forever. */
export function conversationHeld(conversationId: string): boolean {
  return holds.some(hold => {
    try {
      return hold(conversationId)
    } catch {
      return false
    }
  })
}

/** test-only */
export function _resetConversationHolds(): void {
  holds.length = 0
}
