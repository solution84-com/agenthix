import { Pause } from 'lucide-react'
import type { OperationActivityView } from '../../../shared/conversations/protocol'
import { askedPhrase } from './requestWords'

/** The requests a viewer may answer, oldest first: what the strip stands for. */
export function stripRequests(rows: OperationActivityView[], may: (row: OperationActivityView) => boolean): OperationActivityView[] {
  return rows
    .filter((r) => r.state === 'WAITING_FOR_APPROVAL' && may(r))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** "Writer is waiting for you: make a team", or how many requests wait when there are several. */
export function stripText(requests: OperationActivityView[], agentName: string): { who: string; what: string } {
  const first = requests[0]
  const who = `${first?.request?.askedBy ?? agentName} is waiting for you`
  if (requests.length !== 1 || !first) return { who, what: `${requests.length} requests` }
  const asked = { title: first.title, what: first.request?.what, askedBy: first.request?.askedBy ?? agentName }
  return { who, what: askedPhrase(asked) }
}

/**
 * The *waiting for you* strip, above the message box while a request waits for this viewer (conversation spec,
 * Approvals): it keeps the request in view while the person reads, and Show brings its card into view. Absent when
 * nothing waits for them. It sits where the line saying what the agent is doing sits, in place of it.
 */
export function WaitingStrip({ requests, agentName, onShow }: {
  requests: OperationActivityView[]
  agentName: string
  onShow: (operationId: string) => void
}) {
  if (requests.length === 0) return null
  const { who, what } = stripText(requests, agentName)
  return (
    <div role="status" data-testid="waiting-strip" className="mx-4 mb-1 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/5 px-3 py-1.5 text-small">
      <Pause size={14} aria-hidden className="shrink-0 text-warning" />
      <span className="min-w-0 flex-1 truncate text-text-secondary"><span className="font-medium text-text-primary">{who}</span>: {what}</span>
      <button type="button" onClick={() => onShow(requests[0]!.operationId)} className="shrink-0 font-medium text-accent hover:underline max-lg:min-h-10">
        Show
      </button>
    </div>
  )
}
