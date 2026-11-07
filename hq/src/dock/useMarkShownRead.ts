import { useCallback, useEffect, useRef } from 'react'
import { markConversationRead } from 'wasp/client/operations'
import { useConversationInbox } from './useConversationInbox'

/**
 * The conversation in sight in the panel is read: once the list says something in it is unread, it is marked read
 * through its newest message, so its unread count and the bar's badge clear. One hidden behind the bar or under an
 * overlay of its own is not in sight.
 */
export function useMarkShownRead(conversationId: string | null) {
  const { inbox } = useConversationInbox()
  const marked = useRef(new Map<string, number>())
  const row = conversationId ? inbox.conversations.find((c) => c.id === conversationId) : undefined
  const through = row && row.unread > 0 ? row.lastSeq : null
  useEffect(() => {
    if (!conversationId || through === null || (marked.current.get(conversationId) ?? -1) >= through) return
    marked.current.set(conversationId, through)
    markConversationRead({ conversationId, throughSeq: through }).catch(() => { marked.current.delete(conversationId) })
  }, [conversationId, through])
}

/**
 * What the thread says it has shown, marked read while it is in sight: a task's conversation is not in the list that
 * `useMarkShownRead` goes by, so the thread's own count is what clears its unread marks on the board.
 */
export function useMarkSeen(conversationId: string, inSight: boolean): (seq: number) => void {
  const through = useRef(new Map<string, number>())
  return useCallback((seq: number) => {
    if (!inSight || seq <= (through.current.get(conversationId) ?? 0)) return
    through.current.set(conversationId, seq)
    markConversationRead({ conversationId, throughSeq: seq }).catch(() => { through.current.delete(conversationId) })
  }, [conversationId, inSight])
}
