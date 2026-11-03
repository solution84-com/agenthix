import { useState } from 'react'
import { approvalItemsLine, type ApprovalItem } from '@agenthix/core'
import { FoldedLine } from './FoldedLine'
import { formatTime } from './SessionComponents'
import type { ApprovalCardData } from './types'

export interface ApprovalCardActions {
  approveManifest: (input: { runId: string; sessionId: string }) => Promise<unknown>
  rejectManifest: (input: { runId: string; reason: string; sessionId: string }) => Promise<unknown>
}

const SHOWN = 2

/** `whole`: every item at once, for a request still waiting: Approve grants each one, so none is folded away. */
function Items({ items, whole = false }: { items: ApprovalItem[]; whole?: boolean }) {
  const [all, setAll] = useState(whole)
  const shown = all ? items : items.slice(0, SHOWN)
  return (
    <div>
      <ul className="space-y-1">
        {shown.map((item, i) => (
          <li key={i} className="text-small">
            <span className={item.command ? 'font-mono text-micro whitespace-pre-wrap break-all' : 'font-medium'}>{item.does}</span>
            {item.why && <span className="text-text-muted"> — {item.why}</span>}
          </li>
        ))}
      </ul>
      {!whole && items.length > SHOWN && (
        <button type="button" onClick={() => setAll(v => !v)} className="mt-1 text-micro text-text-muted hover:text-text-primary">
          {all ? 'Show less' : `+ ${items.length - SHOWN} more`}
        </button>
      )}
    </div>
  )
}

const by = (card: ApprovalCardData) => (card.decidedByYou ? ' by you' : card.decidedBy ? ` by ${card.decidedBy}` : '')
const when = (card: ApprovalCardData) => (card.decidedAt ? ` · ${formatTime(card.decidedAt)}` : '')

function statusText(card: ApprovalCardData): string {
  if (card.answer === 'approved') return `✓ Approved${by(card)}${when(card)}`
  if (card.answer === 'denied') return `✕ Denied${by(card)}${when(card)}`
  return `Not answered — replaced by a newer message${when(card)}`
}

/** The request waiting for an answer: what it will do and why, in plain words, with Approve and Deny. */
function WaitingCard({ card, agentName, runId, sessionId, actions, onAnswered }: {
  card: ApprovalCardData; agentName: string; runId: string; sessionId: string; actions: ApprovalCardActions; onAnswered: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [denying, setDenying] = useState(false)
  const [reason, setReason] = useState('')
  const run = async (go: () => Promise<unknown>, failure: string) => {
    setBusy(true)
    setError(null)
    try {
      await go()
      onAnswered()
    } catch (e) {
      setError((e as Error)?.message ?? failure)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-1 p-3" role="group" aria-label="Approval needed">
      <p className="text-small font-semibold text-text-primary">{agentName} needs your approval to go on</p>
      <Items items={card.items} whole />
      {error && <p className="text-small text-danger">{error}</p>}
      {denying ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setDenying(false); setReason('') } }}
            placeholder="Reason (optional)"
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-small text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <button type="button" disabled={busy} onClick={() => void run(() => actions.rejectManifest({ runId, sessionId, reason: reason.trim() || 'Denied by the person' }), 'Failed to deny')} className="rounded-lg border border-border px-3 py-1.5 text-small font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50">Deny</button>
          <button type="button" disabled={busy} onClick={() => { setDenying(false); setReason('') }} className="px-2 py-1.5 text-small text-text-muted hover:text-text-primary">Cancel</button>
        </div>
      ) : (
        <div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void run(() => actions.approveManifest({ runId, sessionId }), 'Failed to approve')} className="rounded-lg bg-accent px-3 py-1.5 text-small font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50">Approve</button>
            <button type="button" disabled={busy} onClick={() => setDenying(true)} className="rounded-lg border border-border px-3 py-1.5 text-small font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50">Deny</button>
          </div>
          {card.items.some(i => i.command) && <p className="mt-1.5 text-micro text-text-muted">Approve allows each command exactly as shown, for the next run only</p>}
        </div>
      )}
    </div>
  )
}

/**
 * An approval asked mid-run. While it waits it is a card with Approve and Deny; once answered it folds to one
 * line in the work line's style and opens to the same card in its answered state.
 */
export function ApprovalCard({ card, agentName, runId, sessionId, actions, onAnswered, onOpenRun }: {
  card: ApprovalCardData
  agentName: string
  runId: string | null
  sessionId: string
  /** Absent where the person only reads: a waiting request then shows what it asks, without the buttons. */
  actions?: ApprovalCardActions
  onAnswered?: () => void
  onOpenRun?: (runId: string) => void
}) {
  if (card.answer === 'waiting') {
    if (!runId) return null
    if (!actions) {
      return (
        <div className="space-y-2 rounded-xl border border-border bg-surface-1 p-3" role="group" aria-label="Approval needed">
          <p className="text-small font-semibold text-text-primary">{agentName} is waiting for an approval to go on</p>
          <Items items={card.items} whole />
        </div>
      )
    }
    return <WaitingCard card={card} agentName={agentName} runId={runId} sessionId={sessionId} actions={actions} onAnswered={onAnswered ?? (() => {})} />
  }
  const items = approvalItemsLine(card.items)
  return (
    <FoldedLine label={<>{statusText(card)}{items && <span className="text-text-muted"> · {items}</span>}</>}>
      <div className="space-y-2 py-1">
        <p className="text-small font-medium text-text-primary">{agentName} asked for your approval</p>
        <Items items={card.items} />
        <p className="text-small text-text-secondary">
          {statusText(card)} · {card.answer === 'approved' ? 'for this run only' : 'Nothing ran'}
          {card.reason && <> · “{card.reason}”</>}
          {runId && onOpenRun && <> · <button type="button" onClick={() => onOpenRun(runId)} className="text-accent hover:underline">View on the run ›</button></>}
        </p>
      </div>
    </FoldedLine>
  )
}
