/**
 * ManifestApprovalBubble
 * ======================
 * Shown in the chat stream when the agent has deferred tool requests that
 * require user approval. Blocks the chat until the user approves or rejects.
 *
 * Receives pending manifest data via the `manifestPendingApproval` WebSocket
 * event or restored from DB on page load via getSessionPendingManifest.
 */
import { useState, useRef, useEffect } from 'react'
import { ShieldCheck, Terminal, Loader2, CheckCircle, XCircle } from 'lucide-react'
import type { PendingManifestData, RenderMarkdown } from './types'
import { defaultRenderMarkdown } from './types'

interface ManifestItem {
  name?: string
  pattern?: string
  reason?: string
}

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
}

export function ManifestApprovalBubble({
  data,
  actions,
  onSettled,
  renderMarkdown,
}: ManifestApprovalBubbleProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settled, setSettled] = useState<'approved' | 'rejected' | null>(null)
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const rejectInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (rejectMode) rejectInputRef.current?.focus()
  }, [rejectMode])

  const { runId, summary, pendingManifest } = data
  const { tools, bashPatterns } = pendingManifest

  const handleApprove = async () => {
    setBusy(true)
    setError(null)
    try {
      await actions.approveManifest({ runId, sessionId: data.sessionId })
      setSettled('approved')
      onSettled?.()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to approve')
    } finally {
      setBusy(false)
    }
  }

  const handleReject = async () => {
    const reason = rejectReason.trim() || 'Rejected by user'
    setBusy(true)
    setError(null)
    try {
      await actions.rejectManifest({ runId, reason, sessionId: data.sessionId })
      setSettled('rejected')
      onSettled?.()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to reject')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 space-y-3 my-2">
      <p className="text-micro font-medium text-accent">
        Agent requests extended access
      </p>

      {summary && (renderMarkdown ?? defaultRenderMarkdown)({ content: summary, className: 'text-small text-text-secondary' })}

      {tools.length > 0 && (
        <div className="space-y-1">
          <p className="text-micro uppercase tracking-wide text-text-muted flex items-center gap-1">
            <ShieldCheck size={10} /> Additional tools
          </p>
          {tools.map((t: ManifestItem, i: number) => (
            <div key={i} className="flex items-baseline gap-2 min-w-0">
              <span className="text-small font-mono text-text-primary shrink-0">{t.name}</span>
              {t.reason && <>
                <span className="text-small text-text-muted shrink-0">—</span>
                <span className="text-small text-text-muted break-all">{t.reason}</span>
              </>}
            </div>
          ))}
        </div>
      )}

      {bashPatterns.length > 0 && (
        <div className="space-y-1">
          <p className="text-micro uppercase tracking-wide text-text-muted flex items-center gap-1">
            <Terminal size={10} /> Commands, each allowed exactly as shown
          </p>
          {bashPatterns.map((p: ManifestItem, i: number) => (
            <p key={i} className="text-small font-mono text-text-primary whitespace-pre-wrap break-all">{p.pattern}</p>
          ))}
        </div>
      )}

      {error && <p className="text-small text-danger">{error}</p>}

      <div className="pt-1">
        {settled === 'approved' ? (
          <div className="inline-flex items-center gap-1.5 text-success text-small font-medium">
            <CheckCircle size={13} /> Approved
          </div>
        ) : settled === 'rejected' ? (
          <div className="inline-flex items-center gap-1.5 text-danger text-small font-medium">
            <XCircle size={13} /> Rejected
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
