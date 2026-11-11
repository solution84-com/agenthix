import { useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { ChevronRight } from 'lucide-react'
import { getConversationSegment, useQuery } from 'wasp/client/operations'
import { formatTime } from '@agenthix/ui/sessions'
import type { ConversationMessageView } from '../../shared/conversations/protocol'
import { SegmentMessages } from './SegmentMessages'
import { ReadFailure } from '@agenthix/ui/attention'

type Summarised = Extract<ConversationMessageView, { kind: 'SUMMARISED' }>

/** What a compaction covers, in the words a person reads: "Earlier messages · 10:20 to 11:40". */
function spanLine(body: Summarised['body']): string | null {
  if (body.firstSeq === undefined || body.lastSeq === undefined) return null
  return `Messages ${body.firstSeq} to ${body.lastSeq}`
}

/**
 * A compaction in the thread (long conversations spec, On screen), at the lead's three levels: the span and the
 * brief; opened, the full summary; and from there the messages it covers.
 */
export function SummarisedMarker({ message, conversationId }: { message: Summarised; conversationId: string | undefined }) {
  const { body } = message
  const [open, setOpen] = useState(false)
  const span = spanLine(body)
  return (
    <div className="rounded-lg border border-border-subtle px-3 py-2 text-small text-text-secondary" data-testid="summarised-marker">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-2 text-left max-lg:min-h-10"
      >
        <ChevronRight size={14} aria-hidden className={`mt-1 shrink-0 text-text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1">
          {span && <span className="block text-micro text-text-muted">Earlier in this conversation · {span} · {formatTime(message.createdAt)}</span>}
          <span className="block text-text-primary">{body.brief || 'Earlier messages, summarised'}</span>
        </span>
      </button>
      {open && (body.segmentId && conversationId
        ? <OpenSegment conversationId={conversationId} segmentId={body.segmentId} kept={body.ledgerKept} />
        : <p className="mt-2 whitespace-pre-wrap text-text-secondary">{body.summary}</p>)}
    </div>
  )
}

function OpenSegment({ conversationId, segmentId, kept }: { conversationId: string; segmentId: string; kept?: string[] }) {
  const { data, error, isLoading } = useQuery(getConversationSegment, { conversationId, segmentId })
  const [showing, setShowing] = useState(false)
  if (error) return <ReadFailure what="The summarised messages" error={error} />
  if (isLoading || !data) return <p className="mt-2 text-text-muted">Loading…</p>
  return (
    <div className="mt-2 space-y-2">
      <p className="whitespace-pre-wrap text-text-secondary" data-testid="segment-summary">{data.summary}</p>
      {kept && kept.length > 0 && (
        <p className="text-micro text-text-muted">Kept in mind: {kept.join(' · ')}</p>
      )}
      {showing
        ? <SegmentMessages conversationId={conversationId} firstSeq={data.firstSeq} lastSeq={data.lastSeq} />
        : (
          <button type="button" onClick={() => setShowing(true)} className={`rounded font-medium text-link hover:underline max-lg:min-h-10 ${FOCUS_RING}`}>
            Show the {data.lastSeq - data.firstSeq + 1} messages
          </button>
        )}
    </div>
  )
}
