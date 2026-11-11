import type { ReactNode } from 'react'
import { ArrowDown } from 'lucide-react'
import { Button, FOCUS_RING } from '@agenthix/ui/primitives'
import { durationText, type TaskStateWords } from '@agenthix/ui/tasks'
import { runLine, runName, whenText, clockText, type NowKind, type PageRun } from './taskPageState'

export interface TaskNowProps {
  kind: NowKind
  words: TaskStateWords
  latest: PageRun | null
  /** The latest run's result, as it stated it; null when it stated none. */
  result: string | null
  agentName: string | null
  now: Date
  /** The request card, answered in place. */
  approval?: ReactNode
  /** Why a waiting task has not started, when hq knows. */
  waitText?: string | null
  /** Why Dismiss is not offered on this failure, when it is not. */
  noRetryReason?: string | null
  readOnly?: boolean
  busy?: boolean
  onDismiss: () => void
  /** Points down to the run in the Runs tab. */
  onSeeRun: () => void
  renderMarkdown: (text: string) => ReactNode
}

const BLOCK = 'rounded-xl border px-4 py-3 space-y-2'

function SeeRun({ run, onSeeRun }: { run: PageRun | null; onSeeRun: () => void }) {
  return (
    <button type="button" onClick={onSeeRun} className={`inline-flex items-center gap-1 rounded text-small text-link hover:underline ${FOCUS_RING}`}>
      See {run?.number ? `Run ${run.number}` : 'it'} in Runs
      <ArrowDown size={13} aria-hidden />
    </button>
  )
}

/**
 * Now (T0): one block for the state the task is in, pointing down to the tab that holds the detail. A failure offers
 * only Dismiss: Run again is the header's button, its one place.
 */
export function TaskNow(p: TaskNowProps) {
  const { latest } = p
  switch (p.kind) {
    case 'approval':
      return <section aria-label="Now">{p.approval}</section>
    case 'question':
      return (
        <section aria-label="Now" className={`${BLOCK} border-warning/30 bg-warning/5`}>
          <p className="text-body text-text-primary">{p.agentName ?? 'The agent'} asked you something.</p>
          <p className="text-small text-text-muted">Answer in the conversation: Talk about this task, above.</p>
        </section>
      )
    case 'live':
      return (
        <section aria-label="Now" className={`${BLOCK} border-border bg-card`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-body font-medium text-text-primary">
              {runName(latest)} · running{latest?.startedAt ? ` · ${durationText(p.now.getTime() - Date.parse(latest.startedAt))}` : ''}
            </p>
            <span className="ml-auto"><SeeRun run={latest} onSeeRun={p.onSeeRun} /></span>
          </div>
          {latest?.startedAt && <p className="text-small text-text-muted">Started at {clockText(latest.startedAt)}</p>}
        </section>
      )
    case 'waiting':
      return (
        <section aria-label="Now" className={`${BLOCK} border-border bg-card`}>
          <p className="text-body text-text-primary">{p.words.text}</p>
          {p.waitText && <p className="text-small text-text-muted">{p.waitText}</p>}
        </section>
      )
    case 'failure':
      return (
        <section aria-label="Now" className={`${BLOCK} border-border bg-card`}>
          <p className="text-body text-text-primary">
            {latest ? `${runName(latest)} failed` : 'The run failed'}{p.words.fullReason ? ` · ${p.words.fullReason}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-small text-text-muted">
              {[p.agentName, latest ? whenText(latest.endedAt ?? latest.createdAt, p.now) : null].filter(Boolean).join(' · ')}
            </p>
            {latest && <SeeRun run={latest} onSeeRun={p.onSeeRun} />}
            {p.noRetryReason ? (
              <p className="w-full text-small text-text-muted">{p.noRetryReason}</p>
            ) : !p.readOnly && (
              <span className="ml-auto flex gap-2">
                <Button variant="secondary" disabled={p.busy} onClick={p.onDismiss}>Dismiss</Button>
              </span>
            )}
          </div>
        </section>
      )
    case 'result':
      return (
        <section aria-label="Now" className={`${BLOCK} border-border bg-card`}>
          <div className="flex items-center gap-3">
            <h3 className="text-micro font-medium uppercase tracking-wide text-text-muted">Result</h3>
            <span className="ml-auto"><SeeRun run={latest} onSeeRun={p.onSeeRun} /></span>
          </div>
          {p.result
            ? p.renderMarkdown(p.result)
            : <p className="text-body text-text-muted">{latest?.status === 'CANCELLED' ? 'It was stopped before it said what came of it.' : 'It finished without saying what came of it.'}</p>}
          {latest && <p className="text-small text-text-muted">{runLine(latest, p.now)}</p>}
        </section>
      )
    case 'notStarted':
      return (
        <section aria-label="Now" className={`${BLOCK} border-border bg-card`}>
          <p className="text-body text-text-muted">
            Now: not started · {p.agentName ?? 'Its agent'} runs it when you press Run, or at the time you set.
          </p>
        </section>
      )
  }
}
