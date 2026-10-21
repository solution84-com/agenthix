/**
 * Which of a conversation's untaken messages the next turn answers (conversation layer spec, A message while a
 * reply streams): the oldest, and with it every message after it by the same author, until another author's.
 */
import type { ConversationQueueStateValue } from '../../shared/conversations/protocol'

export interface PendingMessage {
  id: string
  seq: number
  authorId: string | null
  createdAt: Date
  queueState: ConversationQueueStateValue | null
}

export function nextBatch<M extends PendingMessage>(pending: readonly M[]): M[] {
  const ordered = [...pending].sort((a, b) => a.seq - b.seq)
  const first = ordered[0]
  if (!first) return []
  const batch: M[] = []
  for (const message of ordered) {
    if (message.authorId !== first.authorId) break
    batch.push(message)
  }
  return batch
}
