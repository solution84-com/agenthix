import { useEffect, useMemo, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { ChevronDown, ChevronRight, Square } from 'lucide-react'
import { SessionTranscript, type SessionTranscriptProps } from '../sessions/SessionTranscript'
import type { RenderMarkdown, TranscriptEntry } from '../sessions/types'
import { Button } from '../primitives/Button'
import { Tooltip } from '../primitives/Tooltip'
import { segmentSession, type SessionRunInfo } from './sessionRuns'
import { runLineWords, type RunTone } from './taskRunLines'

type RunRecord = { entries: TranscriptEntry[] }

export interface TaskRunsTimelineProps {
  agentName: string
  avatarUrl?: string | null
  /** The task session's id; null before its first run. */
  sessionId: string | null
  socket: Socket | null
  entries: TranscriptEntry[]
  /** Every run of the task, in any order: shown newest first. */
  runs: SessionRunInfo[]
  refetch: () => Promise<RunRecord>
  runningRunId?: string | null
  /** The run waiting for the person's okay. */
  waitingRunId?: string | null
  latestFailureRunId?: string | null
  /** A run to show open, from the address (*See it in Runs*). */
  openRunId?: string | null
  renderMarkdown?: RenderMarkdown
  /** What the person may do to the record (answer an approval, Try again); left out, each is absent. */
  recordActions?: Pick<SessionTranscriptProps<RunRecord>, 'approvalActions' | 'onTryAgain' | 'trying'>
  links?: SessionTranscriptProps<RunRecord>['actions']
  /** Stops the live run; left out for someone who may not. */
  onStop?: () => void
  stopping?: boolean
  now?: Date
  loading?: boolean
}

const DOT: Record<RunTone, string> = {
  live: 'bg-accent', done: 'bg-success', failed: 'bg-danger', muted: 'bg-text-muted', needs: 'bg-warning',
}

/** What the live run is doing now: its latest words or tool, as the record holds them. */
function doingOf(entries: TranscriptEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.role === 'ASSISTANT' && e.content?.trim()) return e.content.trim().split('\n')[0]
    if (e.toolName) return `Using ${e.toolName}`
  }
  return null
}

/**
 * A task's runs as one timeline (T0, the Runs tab), newest first. Each run is one line, its stored number, what it did
 * or is doing, who started it, when and how long, and opens to its steps; the live run is open, with Stop. Nothing
 * is typed into a run: to change course, stop it or talk to the agent.
 */
export function TaskRunsTimeline(p: TaskRunsTimelineProps) {
  const now = p.now ?? new Date()
  const segments = useMemo(() => segmentSession(p.entries, p.runs, p.waitingRunId ?? null).filter(s => s.run), [p.entries, p.runs, p.waitingRunId])
  const newestFirst = [...segments].reverse()
  const liveId = newestFirst.find(s => s.run!.status === 'RUNNING' || s.run!.status === 'PENDING')?.run!.id ?? null
  const [opened, setOpened] = useState<Set<string>>(() => new Set([p.openRunId, liveId, p.waitingRunId].filter((id): id is string => !!id)))
  useEffect(() => {
    const more = [p.openRunId, liveId].filter((id): id is string => !!id)
    if (more.length) setOpened(o => (more.every(id => o.has(id)) ? o : new Set([...o, ...more])))
  }, [p.openRunId, liveId])

  if (p.loading) return <p className="text-small text-text-muted">Loading…</p>
  if (!p.sessionId || newestFirst.length === 0) return <p className="text-small text-text-muted">No runs yet.</p>

  const toggle = (id: string) => setOpened(o => {
    const next = new Set(o)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <ol className="space-y-2" aria-label="Runs">
      {newestFirst.map(s => {
        const run = s.run!
        const words = runLineWords(run, { now, waiting: run.id === p.waitingRunId, doing: run.id === liveId ? doingOf(s.entries) : null })
        const open = opened.has(run.id)
        return (
          <li key={run.id} data-run={run.id} data-testid="run-line" className={`rounded-lg border ${words.live ? 'border-accent/40' : 'border-border-subtle'}`}>
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button" aria-expanded={open} onClick={() => toggle(run.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-small"
              >
                {open ? <ChevronDown size={14} aria-hidden className="shrink-0 text-text-muted" /> : <ChevronRight size={14} aria-hidden className="shrink-0 text-text-muted" />}
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[words.tone]}`} />
                <span className="shrink-0 font-semibold text-text-primary">{words.title}</span>
                <span className="min-w-0 flex-1 truncate text-text-secondary">{words.what}</span>
                <span className="shrink-0 text-micro text-text-muted max-sm:hidden">{words.facts}</span>
              </button>
              {words.live && p.onStop && (
                <Tooltip label={`Stop ${words.title}`} side="top">
                  <Button variant="secondary" size="sm" disabled={p.stopping} onClick={p.onStop} leadingIcon={<Square size={11} aria-hidden />}>Stop</Button>
                </Tooltip>
              )}
            </div>
            {open && (
              <div className="border-t border-border-subtle px-3 py-2">
                <p className="pb-1 text-micro text-text-muted sm:hidden">{words.facts}</p>
                <SessionTranscript
                  sessionId={p.sessionId!}
                  socket={run.id === liveId ? p.socket : null}
                  entries={s.entries}
                  refetch={p.refetch}
                  runningRunId={run.id === liveId ? p.runningRunId : null}
                  latestFailureRunId={p.latestFailureRunId}
                  agentName={p.agentName}
                  avatarUrl={p.avatarUrl}
                  renderMarkdown={p.renderMarkdown}
                  actions={p.links ?? { canOpenTarget: () => false }}
                  {...p.recordActions}
                  label={`${words.title}'s steps`}
                  className="py-1"
                  emptyState={<p className="text-small text-text-muted">{words.live ? 'Starting…' : 'No steps were kept for this run.'}</p>}
                />
                {words.live && (
                  <p className="pt-2 text-micro text-text-muted">Works on its own until it finishes. To change course, stop it or talk to {p.agentName}.</p>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
