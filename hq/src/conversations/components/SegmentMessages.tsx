import { useCallback, useEffect, useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { getConversationMessages } from 'wasp/client/operations'
import { formatTime } from '@agenthix/ui/sessions'
import type { ConversationMessageView } from '../../shared/conversations/protocol'
import { wordsOf } from '../long/zoom/spans'
import { ShowAttention } from '@agenthix/ui/attention'

/** The messages a compaction covers, read from the record a page at a time, newest page first and shown in order. */
export function SegmentMessages({ conversationId, firstSeq, lastSeq }: { conversationId: string; firstSeq: number; lastSeq: number }) {
  const [messages, setMessages] = useState<ConversationMessageView[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (before: number) => {
    setLoading(true)
    try {
      const page = await getConversationMessages({ conversationId, beforeSeq: before })
      const inSpan = page.messages.filter((m) => m.seq >= firstSeq)
      setMessages((held) => [...inSpan, ...held].sort((a, b) => a.seq - b.seq))
      setMore(page.hasMore && inSpan.length === page.messages.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The messages could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [conversationId, firstSeq])

  useEffect(() => { void load(lastSeq + 1) }, [load, lastSeq])

  const oldest = messages[0]?.seq
  return (
    <div className="space-y-2 border-t border-border-subtle pt-2" data-testid="segment-messages">
      <ShowAttention kind="alert" text={error} title="Earlier messages could not be read" onClose={() => setError(null)} />
      {more && oldest !== undefined && (
        <button type="button" disabled={loading} onClick={() => void load(oldest)} className={`rounded font-medium text-link not-disabled:hover:underline disabled:cursor-not-allowed disabled:opacity-40 max-lg:min-h-10 ${FOCUS_RING}`}>
          Earlier messages
        </button>
      )}
      {loading && messages.length === 0 && <p className="text-text-muted">Loading…</p>}
      {messages.map((m) => {
        const words = wordsOf(m)
        if (!words || !words.trim()) return null
        return (
          <p key={m.id} className="whitespace-pre-wrap break-words">
            <span className="text-micro text-text-muted">{m.role === 'PERSON' ? 'You' : m.role === 'AGENT' ? 'Agent' : 'HQ'} · {formatTime(m.createdAt)} · </span>
            {words}
          </p>
        )
      })}
    </div>
  )
}
