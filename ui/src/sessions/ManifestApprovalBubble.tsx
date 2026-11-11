/**
 * ManifestApprovalBubble
 * ======================
 * A run's request waiting for the person's okay, on a task's page, drawn as the one request card: Approve and Deny,
 * then the outcome in place.
 *
 * Receives pending manifest data via the `manifestPendingApproval` WebSocket
 * event or restored from DB on page load via getSessionPendingManifest.
 */
import { useState } from 'react'
import { approvalItems } from '@agenthix/core'
import { ManifestRequestCard } from './ManifestRequestCard'
import type { RequestCardFailureAs } from './RequestCard'
import type { PendingManifestData, RenderMarkdown } from './types'
import { defaultRenderMarkdown } from './types'

export interface ManifestApprovalBubbleActions {
  // sessionId rides along (plan 5d-2 task 9a): a chat run's PENDING_APPROVAL
  // state now lives on the Execution Site, and hq has no local runId→session
  // mapping for a chat run to resolve which site to ask — this data object
  // already carries sessionId, so passing it through costs nothing and closes
  // that gap.
  approveManifest: (input: { runId: string; sessionId: string }) => Promise<unknown>
  rejectManifest: (input: { runId: string; reason: string; sessionId: string }) => Promise<unknown>
}

export interface ManifestApprovalBubbleProps {
  data: PendingManifestData
  actions: ManifestApprovalBubbleActions
  onSettled?: () => void
  renderMarkdown?: RenderMarkdown
  /** Who asks; "The agent" when not known. */
  agentName?: string
  /** Where a failed answer is said: the dialog on a task's page (the default), a line under the card in a conversation. */
  failureAs?: RequestCardFailureAs
}

export function ManifestApprovalBubble({ data, actions, onSettled, renderMarkdown, agentName = 'The agent', failureAs }: ManifestApprovalBubbleProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settled, setSettled] = useState<{ approved: boolean; at: string } | null>(null)
  const { runId, sessionId, summary, pendingManifest } = data

  const answer = async (approved: boolean, note?: string) => {
    setBusy(true)
    setError(null)
    try {
      if (approved) await actions.approveManifest({ runId, sessionId })
      else await actions.rejectManifest({ runId, sessionId, reason: note ?? 'Denied by the person' })
      setSettled({ approved, at: new Date().toISOString() })
      onSettled?.()
    } catch (e) {
      setError((e as Error)?.message ?? (approved ? 'Failed to approve' : 'Failed to deny'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="my-2">
      <ManifestRequestCard
        agentName={agentName}
        items={approvalItems(pendingManifest)}
        summary={summary ? (renderMarkdown ?? defaultRenderMarkdown)({ content: summary, className: 'text-small text-text-secondary' }) : undefined}
        state={settled ? { kind: 'answered', approved: settled.approved, by: null, at: settled.at } : { kind: 'waiting' }}
        error={error}
        failureAs={failureAs}
        answer={{ busy, onApprove: () => void answer(true), onDeny: note => void answer(false, note) }}
      />
    </div>
  )
}
