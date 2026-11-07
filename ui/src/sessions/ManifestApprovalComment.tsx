/**
 * ManifestApprovalComment
 * =======================
 * Renders an interactive approval card when a TaskComment content begins
 * with `__MANIFEST_APPROVAL__:`.
 *
 * Draws the run's request as the one request card: Approve and Deny call the
 * server actions; once answered it says the outcome in place, and a request
 * something newer replaced says that, with no buttons.
 */
import { useState, useEffect } from 'react'
import { approvalItems } from '@agenthix/core'
import { ManifestRequestCard } from './ManifestRequestCard'
import type { RequestCardState } from './RequestCard'
import type { RenderMarkdown } from './types'
import { defaultRenderMarkdown } from './types'

const MANIFEST_PREFIX = '__MANIFEST_APPROVAL__:'

export function isManifestApprovalComment(content: string): boolean {
  return content.startsWith(MANIFEST_PREFIX)
}

interface ManifestItem {
  name?: string
  pattern?: string
  reason?: string
}

interface PendingManifest {
  tools: ManifestItem[]
  bashPatterns: ManifestItem[]
}

interface ManifestPayload {
  runId: string
  summary: string | null
  pendingManifest: PendingManifest
}

function parsePayload(content: string): ManifestPayload | null {
  try {
    return JSON.parse(content.slice(MANIFEST_PREFIX.length))
  } catch {
    return null
  }
}

export interface ManifestApprovalCommentQueries {
  getRunManifestStatus: (input: { runId: string; sessionId: string }) => Promise<{ manifestStatus: string | null } | null | undefined>
}

export interface ManifestApprovalCommentActions {
  approveManifest: (input: { runId: string }) => Promise<unknown>
  rejectManifest: (input: { runId: string; reason: string }) => Promise<unknown>
}

export interface ManifestApprovalCommentProps {
  content: string
  /** The session this comment's run belongs to — routes getRunManifestStatus to the site that holds it. */
  sessionId: string
  queries: ManifestApprovalCommentQueries
  actions: ManifestApprovalCommentActions
  renderMarkdown?: RenderMarkdown
  /** Who asks; "The agent" when not known. */
  agentName?: string
}

export function ManifestApprovalComment({ content, sessionId, queries, actions, renderMarkdown, agentName = 'The agent' }: ManifestApprovalCommentProps) {
  const payload = parsePayload(content)
  const [runStatus, setRunStatus] = useState<{ manifestStatus: string | null } | null | undefined>(undefined)

  useEffect(() => {
    if (!payload) return
    let cancelled = false
    queries.getRunManifestStatus({ runId: payload.runId, sessionId }).then(result => {
      if (!cancelled) setRunStatus(result)
    }).catch(() => {
      if (!cancelled) setRunStatus(null)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.runId, sessionId])

  const [local, setLocal] = useState<{ approved: boolean; at: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!payload) {
    return <p className="text-small text-danger">Invalid manifest payload</p>
  }
  const { runId, summary, pendingManifest } = payload

  // Only a run still pending may be answered; a request replaced by something newer in its task can no longer be.
  const stored = runStatus?.manifestStatus
  const state: RequestCardState = local ? { kind: 'answered', approved: local.approved, by: null, at: local.at }
    : stored === 'APPROVED' ? { kind: 'answered', approved: true, by: 'Someone', at: null }
    : stored === 'REJECTED' ? { kind: 'answered', approved: false, by: 'Someone', at: null }
    : stored === 'SUPERSEDED' ? { kind: 'ended', text: 'Not answered: something newer happened in this task' }
    : { kind: 'waiting' }

  const answer = async (approved: boolean, note?: string) => {
    setBusy(true)
    setError(null)
    try {
      if (approved) await actions.approveManifest({ runId })
      else await actions.rejectManifest({ runId, reason: note ?? 'Denied by the person' })
      setLocal({ approved, at: new Date().toISOString() })
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? (approved ? 'Failed to approve' : 'Failed to deny'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ManifestRequestCard
      agentName={agentName}
      items={approvalItems(pendingManifest)}
      summary={summary ? (renderMarkdown ?? defaultRenderMarkdown)({ content: summary, className: 'text-small text-text-secondary' }) : undefined}
      state={state}
      error={error}
      answer={{ busy, onApprove: () => void answer(true), onDeny: note => void answer(false, note) }}
    />
  )
}
