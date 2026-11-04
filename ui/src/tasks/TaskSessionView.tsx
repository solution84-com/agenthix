import { useState, type ReactNode } from 'react'
import type { Socket } from 'socket.io-client'
import { Send } from 'lucide-react'
import { SessionTranscript, type SessionTranscriptProps } from '../sessions/SessionTranscript'
import { itemRunId, type ConversationItem } from '../sessions/conversationModel'
import type { RenderMarkdown, TranscriptEntry } from '../sessions/types'
import { segmentSession, type SessionRunInfo } from './sessionRuns'
import { TasksViewHeader } from './TasksToolParts'

export interface TaskSessionViewProps {
  /** "‹ WEB-27": where back goes. */
  /** Absent on a page whose breadcrumb is the way back. */
  backLabel?: string
  onBack?: () => void
  /** "WEB-27 · Fix the checkout redirect · Frontend dev · 2 runs". */
  summary: string
  agentName: string
  avatarUrl?: string | null
  /** The session's id; null before the task has one. */
  sessionId: string | null
  socket: Socket | null
  entries: TranscriptEntry[]
  runs: SessionRunInfo[]
  /** Reads the session again when a run ends. */
  refetch: () => Promise<{ entries: TranscriptEntry[] }>
  /** A run going now, so its work shows live. */
  runningRunId?: string | null
  /** The run waiting for the person's answer, named at its end. */
  waitingRunId?: string | null
  latestFailureRunId?: string | null
  loading?: boolean
  renderMarkdown?: RenderMarkdown
  /** What the person may do to the record (answer an approval, Try again, Send now, Cancel); left out, each is absent. */
  recordActions?: Pick<SessionTranscriptProps<{ entries: TranscriptEntry[] }>, 'approvalActions' | 'onSendNow' | 'onCancelWaiting' | 'onTryAgain' | 'trying'>
  /** Details, "Open the run" and a change's link. */
  links?: Pick<SessionTranscriptProps<{ entries: TranscriptEntry[] }>, 'actions'>['actions']
  /** Sends into the session; resolves when it was accepted. */
  onSend: (text: string) => Promise<void>
  /** Why the person cannot send; the box is shown disabled with this. */
  sendDisabledReason?: string
  /** When set, the person only reads here (a project Viewer): no box, and this line in its place. */
  readOnlyReason?: string
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1 text-micro text-text-muted" role="separator">
      <span className="h-px flex-1 bg-border-subtle" />
      <span className="shrink-0">{children}</span>
      <span className="h-px flex-1 bg-border-subtle" />
    </div>
  )
}


/** Where each run starts and ends in the record: a line before its first item and one after its last. */
function runDividers(items: ConversationItem[], runs: SessionRunInfo[], waitingRunId: string | null) {
  const before = new Map<string, ReactNode>()
  const after = new Map<string, ReactNode>()
  const first = new Map<string, string>()
  const last = new Map<string, string>()
  for (const item of items) {
    const id = itemRunId(item)
    if (!id) continue
    if (!first.has(id)) first.set(id, item.key)
    last.set(id, item.key)
  }
  for (const s of segmentSession([], runs, waitingRunId)) {
    const id = s.run?.id
    if (!id) continue
    const firstKey = first.get(id)
    const lastKey = last.get(id)
    if (s.start && firstKey) before.set(firstKey, <Divider key={`s-${id}`}>{s.start}</Divider>)
    if (s.end && lastKey) after.set(lastKey, <Divider key={`e-${id}`}>{s.end}</Divider>)
  }
  return { before, after }
}

/**
 * A task's session inside the tools panel (every screen reviewed spec §3): the
 * whole transcript with each run as a divider, and a box at the bottom that
 * steers the run now — or starts one when nothing is running.
 */
export function TaskSessionView(p: TaskSessionViewProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const send = async () => {
    const value = text.trim()
    if (!value || busy || p.sendDisabledReason) return
    setBusy(true)
    setError('')
    try {
      await p.onSend(value)
      setText('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not send')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TasksViewHeader back={p.backLabel} onBack={p.onBack} title="Session" />
      <p className="px-4 pt-3 text-small text-text-muted">{p.summary}</p>
      {p.loading ? (
        <p className="px-4 py-3 text-small text-text-muted">Loading…</p>
      ) : !p.sessionId ? (
        <p className="px-4 py-3 text-small text-text-muted">Nothing has happened in this session yet.</p>
      ) : (
        <SessionTranscript
          sessionId={p.sessionId}
          socket={p.socket}
          entries={p.entries}
          refetch={p.refetch}
          runningRunId={p.runningRunId}
          latestFailureRunId={p.latestFailureRunId}
          agentName={p.agentName}
          avatarUrl={p.avatarUrl}
          renderMarkdown={p.renderMarkdown}
          actions={p.links ?? { canOpenTarget: () => false }}
          {...p.recordActions}
          around={items => runDividers(items, p.runs, p.waitingRunId ?? null)}
          label="Session transcript"
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          emptyState={<p className="text-small text-text-muted">Nothing has happened in this session yet.</p>}
        />
      )}
      {p.readOnlyReason ? (
        <p className="border-t border-border-subtle px-4 py-3 text-small text-text-muted">{p.readOnlyReason}</p>
      ) : <div className="space-y-1.5 border-t border-border-subtle px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            rows={2}
            disabled={busy || !!p.sendDisabledReason}
            aria-label={`Tell ${p.agentName} what to do now`}
            placeholder={`Tell ${p.agentName} what to do now…`}
            title={p.sendDisabledReason}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}
            className="min-w-0 flex-1 resize-none rounded-xl border border-border bg-surface-1 px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          />
          <button
            type="button"
            aria-label="Send"
            disabled={busy || !text.trim() || !!p.sendDisabledReason}
            onClick={() => void send()}
            className="rounded-lg bg-accent p-2 text-on-accent hover:bg-accent-hover disabled:opacity-40"
          >
            <Send size={14} aria-hidden />
          </button>
        </div>
        <p className="text-micro text-text-muted">
          {p.sendDisabledReason ?? 'Steers the run now. Anything to keep for later, or for others, goes in a comment.'}
        </p>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
      </div>}
    </div>
  )
}
