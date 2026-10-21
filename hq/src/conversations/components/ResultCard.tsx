import { useState } from 'react'
import { AlertCircle, CheckCircle2, CircleSlash } from 'lucide-react'
import { useQuery, getOperationResult } from 'wasp/client/operations'
import type { ConversationMessageView } from '../../shared/conversations/protocol'
import { cardSummaryLine } from '../hooks/activityState'

type ResultMessage = Extract<ConversationMessageView, { kind: 'RESULT' }>

/** The run behind a completion, fetched when opened: what it gave, and the steps it took. */
function ResultDetail({ conversationId, operationId }: { conversationId: string; operationId: string }) {
  const { data, error, isLoading } = useQuery(getOperationResult, { conversationId, operationId })
  if (error) return <p role="alert" className="mt-2 text-small text-danger">{error.message}</p>
  if (isLoading || !data) return <p className="mt-2 text-small text-text-muted">Loading…</p>
  return (
    <div className="mt-2 space-y-2 border-t border-border-subtle pt-2" data-testid="result-detail">
      {data.summary && <p className="whitespace-pre-wrap break-words text-small text-text-primary">{data.summary}</p>}
      {data.stated === false && <p className="text-micro text-text-muted">The run did not state a result; this is what it said last.</p>}
      {data.problem && <p role="status" className="text-small text-text-muted">{data.problem}</p>}
      {data.work && (
        <div>
          {data.work.summary && <p className="text-small font-medium text-text-secondary">{data.work.summary}</p>}
          <ul className="mt-1 space-y-0.5 text-small text-text-secondary">
            {data.work.steps.map((s, i) => <li key={i}>{s.text}</li>)}
          </ul>
        </div>
      )}
      {data.runUrl && <a href={data.runUrl} className="text-small font-medium text-accent hover:underline">Open the full record</a>}
    </div>
  )
}

const OUTCOME = {
  completed: { label: 'Finished', Icon: CheckCircle2, tone: 'text-success' },
  failed: { label: 'Did not finish', Icon: AlertCircle, tone: 'text-danger' },
  cancelled: { label: 'Stopped', Icon: CircleSlash, tone: 'text-text-muted' },
  detached: { label: 'Stopped', Icon: CircleSlash, tone: 'text-text-muted' },
} as const

/** A completion: title, the one-line result, and *View results*. A failure carries its reason. */
export function ResultCard({ message, conversationId }: { message: ResultMessage; conversationId?: string }) {
  const [open, setOpen] = useState(false)
  const { title, outcome, summary, boundaryName } = message.body
  const { label, Icon, tone } = OUTCOME[outcome]
  const failed = outcome === 'failed'
  return (
    <div
      data-testid="result-card"
      className={`max-w-[720px] rounded-lg border px-3 py-2.5 ${failed ? 'border-danger/30 bg-danger/5' : 'border-border-subtle'}`}
    >
      <div className="flex items-start gap-2">
        <Icon size={14} aria-hidden className={`mt-0.5 shrink-0 ${tone}`} />
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium text-text-primary">
            {label}: {title}{boundaryName && <span className="font-normal text-text-muted"> · {boundaryName}</span>}
          </p>
          {summary && <p className="mt-0.5 text-small text-text-secondary">{cardSummaryLine(summary)}</p>}
        </div>
        {message.operationId && conversationId && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 text-small font-medium text-accent hover:underline max-lg:min-h-10"
          >
            {open ? 'Hide results' : 'View results'}
          </button>
        )}
      </div>
      {open && message.operationId && conversationId && <ResultDetail conversationId={conversationId} operationId={message.operationId} />}
    </div>
  )
}
