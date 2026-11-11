import { useCallback, type ReactNode } from 'react'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { useQuery, getConversationInbox } from 'wasp/client/operations'
import { useSocketListener } from 'wasp/client/webSocket'
import type { ConversationInbox } from '../shared/conversations/inbox'

const EMPTY: ConversationInbox = { conversations: [], waiting: 0, needsYou: 0, unread: 0 }

/**
 * Every conversation the person can open, with what is going on in each: the chat's bar, its badge and its lists.
 * Read again when what needs the person changes (a request for approval, a result, a run's status) and after any
 * action on a conversation; nothing is polled. A list draws `unread` in place of "Loading…" when it could not be read
 * through the retries; with conversations held, it draws `stale` in its meta line once they are a minute old.
 */
export function useConversationInbox(archived = false): { inbox: ConversationInbox; loaded: boolean; unread: ReactNode; stale: ReactNode } {
  // The open ones share one cache entry with the bar; the Chat page's archived filter reads the archived ones.
  const query = useQuery(getConversationInbox, archived ? { archived: true } : undefined)
  const { data, refetch } = query
  const read = useBackgroundRead(query, { what: 'The conversations' })
  const again = useCallback(() => { void refetch() }, [refetch])
  useSocketListener('notifications:changed', again)
  useSocketListener('needsYou:changed', again)
  useSocketListener('runs:changed', again)
  return {
    inbox: data ?? EMPTY, loaded: data !== undefined,
    unread: read.failedWithoutData ? read.nudge : null, stale: read.failedWithoutData ? null : read.nudge,
  }
}
