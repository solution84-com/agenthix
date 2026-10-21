/**
 * ManifestApprovalComment
 * =======================
 * Renders an interactive approval card when a TaskComment content begins
 * with `__MANIFEST_APPROVAL__:`.
 *
 * Shows the extended tools and bash patterns the agent has requested.
 * Approve / Reject buttons call the server actions. After action, the card
 * is replaced with a status badge; a request something newer replaced shows
 * that, with no buttons.
 */
import { useState, useRef, useEffect } from 'react'
import { CheckCircle, XCircle, ShieldCheck, Terminal, Loader2, History } from 'lucide-react'
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
}

export function ManifestApprovalComment({ content, sessionId, queries, actions, renderMarkdown }: ManifestApprovalCommentProps) {
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

  // Derive initial status from DB — only show pending if the run is actually pending
  // A request replaced by something newer in its task can no longer be answered.
  const resolvedStatus = runStatus?.manifestStatus === 'APPROVED' ? 'approved'
    : runStatus?.manifestStatus === 'REJECTED' ? 'rejected'
    : runStatus?.manifestStatus === 'SUPERSEDED' ? 'replaced'
    : 'pending'

  const [localStatus, setLocalStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null)
  const status = localStatus ?? resolvedStatus

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const rejectInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (rejectMode) rejectInputRef.current?.focus()
  }, [rejectMode])

  if (!payload) {
    return <p className="text-small text-danger">Invalid manifest payload</p>
  }

  const { runId, summary, pendingManifest } = payload
  const { tools: extendedTools, bashPatterns: extendedBashPatterns } = pendingManifest

  const handleApprove = async () => {
    setBusy(true)
    setError(null)
    try {
      await actions.approveManifest({ runId })
      setLocalStatus('approved')
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to approve')
    } finally {
      setBusy(false)
    }
  }

  const handleReject = async () => {
    const reason = rejectReason.trim() || 'Rejected by user'
    setBusy(true)
    setError(null)
    try {
      await actions.rejectManifest({ runId, reason })
      setLocalStatus('rejected')
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to reject')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 space-y-3">
      <p className="text-micro font-medium text-accent">
        Agent requests extended access
      </p>

      {summary && (renderMarkdown ?? defaultRenderMarkdown)({ content: summary, className: 'text-small text-text-secondary' })}

      {extendedTools.length > 0 && (
        <div className="space-y-1">
          <p className="text-micro uppercase tracking-wide text-text-muted flex items-center gap-1">
            <ShieldCheck size={10} /> Additional tools
          </p>
          {extendedTools.map((t, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-small font-mono text-text-primary shrink-0">{t.name}</span>
            </div>
          ))}
        </div>
      )}

      {extendedBashPatterns.length > 0 && (
        <div className="space-y-1">
          <p className="text-micro uppercase tracking-wide text-text-muted flex items-center gap-1">
            <Terminal size={10} /> Bash prefixes
          </p>
          {extendedBashPatterns.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-small font-mono text-text-primary shrink-0">{p.pattern}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-small text-danger">{error}</p>}

      <div className="pt-1">
        {status === 'approved' ? (
          <div className="inline-flex items-center gap-1.5 text-success text-small font-medium">
            <CheckCircle size={13} /> Approved
          </div>
        ) : status === 'rejected' ? (
          <div className="inline-flex items-center gap-1.5 text-danger text-small font-medium">
            <XCircle size={13} /> Rejected
          </div>
        ) : status === 'replaced' ? (
          <div className="inline-flex items-center gap-1.5 text-text-muted text-small font-medium">
            <History size={13} /> Replaced — something newer happened in this task
          </div>
        ) : rejectMode ? (
          <div className="flex items-center gap-2">
            <input
              ref={rejectInputRef}
              type="text"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleReject(); if (e.key === 'Escape') { setRejectMode(false); setRejectReason('') } }}
              placeholder="Reason (optional)"
              disabled={busy}
              className="flex-1 bg-surface-2 border border-danger/30 rounded-lg px-2.5 py-1.5 text-small text-text-secondary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-danger/40 disabled:opacity-50"
            />
            <button
              onClick={() => void handleReject()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 bg-danger/20 hover:bg-danger/30 text-danger text-small font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
              Reject
            </button>
            <button
              onClick={() => { setRejectMode(false); setRejectReason('') }}
              disabled={busy}
              className="text-small text-text-muted hover:text-text-secondary px-2 py-1.5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => void handleApprove()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 bg-success/20 hover:bg-success/30 text-success text-small font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
              Approve
            </button>
            <button
              onClick={() => setRejectMode(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 bg-danger/10 hover:bg-danger/20 text-danger text-small font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              <XCircle size={11} /> Reject
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
