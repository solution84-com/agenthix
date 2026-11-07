import { useState } from 'react'
import { ManifestRequestCard } from './ManifestRequestCard'
import type { RequestCardState } from './RequestCard'
import type { ApprovalCardData } from './types'

export interface ApprovalCardActions {
  approveManifest: (input: { runId: string; sessionId: string }) => Promise<unknown>
  rejectManifest: (input: { runId: string; reason: string; sessionId: string }) => Promise<unknown>
}

const DEFAULT_REASONS = new Set(['Denied by the person', 'Rejected by user'])

function stateOf(card: ApprovalCardData, local: 'approved' | 'denied' | null): RequestCardState {
  if (local) return { kind: 'answered', approved: local === 'approved', by: null, at: new Date().toISOString() }
  if (card.answer === 'waiting') return { kind: 'waiting' }
  if (card.answer === 'not_answered') return { kind: 'ended', text: 'Not answered: something newer replaced it' }
  const by = card.decidedByYou ? null : card.decidedBy ?? 'Someone'
  // The words sent when the person gave no reason are not theirs to show.
  const note = card.reason && !DEFAULT_REASONS.has(card.reason) ? card.reason : null
  return { kind: 'answered', approved: card.answer === 'approved', by, at: card.decidedAt, note }
}

/**
 * An approval asked mid-run, as the one request card: while it waits, Approve and Deny for those who may answer;
 * once answered the buttons go and it says the outcome in place.
 */
export function ApprovalCard({ card, agentName, runId, sessionId, actions, waitingFor, onAnswered, onOpenRun }: {
  card: ApprovalCardData
  agentName: string
  runId: string | null
  sessionId: string
  /** Absent where the person only reads: a waiting request then shows what it asks, without the buttons. */
  actions?: ApprovalCardActions
  /** Without actions, who answers it; by default someone who works here. */
  waitingFor?: string
  onAnswered?: () => void
  onOpenRun?: (runId: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState<'approved' | 'denied' | null>(null)
  if (card.answer === 'waiting' && !runId && !local) return null
  const run = async (go: () => Promise<unknown>, answered: 'approved' | 'denied', failure: string) => {
    setBusy(true)
    setError(null)
    try {
      await go()
      setLocal(answered)
      onAnswered?.()
    } catch (e) {
      setError((e as Error)?.message ?? failure)
    } finally {
      setBusy(false)
    }
  }
  const state = stateOf(card, local)
  return (
    <ManifestRequestCard
      agentName={agentName}
      items={card.items}
      state={state}
      error={error}
      waitingFor={waitingFor ?? 'Waiting for someone who works here to answer'}
      answer={actions && runId ? {
        busy,
        onApprove: () => void run(() => actions.approveManifest({ runId, sessionId }), 'approved', 'Failed to approve'),
        onDeny: note => void run(() => actions.rejectManifest({ runId, sessionId, reason: note ?? 'Denied by the person' }), 'denied', 'Failed to deny'),
      } : undefined}
      footer={state.kind !== 'waiting' && runId && onOpenRun ? (
        <button type="button" onClick={() => onOpenRun(runId)} className="text-small text-accent hover:underline">View on the run ›</button>
      ) : undefined}
    />
  )
}
