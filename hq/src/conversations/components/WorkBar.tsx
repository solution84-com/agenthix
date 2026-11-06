import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { contextShare, type ContextUse } from '@agenthix/core'
import type { OperationActivityView } from '../../shared/conversations/protocol'
import { stateWord, type LiveLines } from '../hooks/activityState'
import { barHeading, workBar } from '../hooks/workBarState'
import type { ConversationRunCard } from '../../workflows/conversationRuns'
import { isRunActive, WorkflowRunRow } from './WorkflowRunRow'

/** How much of the background session's context its work has filled, as the runtime last reported it. */
export function contextLine(use: ContextUse | null | undefined): string | null {
  return use ? `Context ${contextShare(use).percent}% full` : null
}

export type WorkBarActions = {
  /** Whether the viewer may speak here: only they can stop work. */
  canAct: boolean
  busy: boolean
  onStop: (operationId: string) => void
}

function Title({ row }: { row: OperationActivityView }) {
  const title = <span className="font-medium text-text-primary">{row.title}</span>
  return row.runHref ? <Link to={row.runHref} className="hover:underline">{title}</Link> : title
}

/** Work under way: its title (opening its run), where, how it goes, its live lines, and Stop. */
function WorkRow({ row, live, actions }: { row: OperationActivityView; live: LiveLines[string] | undefined; actions: WorkBarActions }) {
  const lines = live?.lines ?? row.lines
  const ended = live?.endedHelpers ?? row.endedHelpers
  const context = contextLine(row.contextUse)
  return (
    <li className="px-3 py-2" data-testid="work-bar-row">
      <div className="flex items-center gap-2">
        <Loader2 size={12} aria-hidden className="shrink-0 text-accent motion-safe:animate-spin" />
        <p className="min-w-0 flex-1 truncate text-small text-text-muted">
          <Title row={row} />
          {row.boundaryName && <span> · {row.boundaryName}</span>}
          <span> · {stateWord(row.state)}</span>
        </p>
        {actions.canAct && row.canStop && (
          <button
            type="button"
            disabled={actions.busy}
            onClick={() => actions.onStop(row.operationId)}
            className="shrink-0 text-small font-medium text-text-secondary hover:text-text-primary disabled:opacity-50 max-lg:min-h-10"
          >
            Stop
          </button>
        )}
      </div>
      {lines.length > 0 && (
        <ul className="mt-1 space-y-0.5 pl-5 text-micro text-text-secondary">
          {lines.map((line, i) => <li key={`${i}-${line}`} className="truncate">{line}</li>)}
        </ul>
      )}
      {(context || ended > 0) && (
        <p className="mt-0.5 pl-5 text-micro text-text-muted" data-testid="work-bar-detail">
          {[context, ended > 0 && (ended === 1 ? '1 part done' : `${ended} parts done`)].filter(Boolean).join(' · ')}
        </p>
      )}
    </li>
  )
}

/**
 * The work bar (walkthrough finding 34): the last thing in the thread, above the message box but not pinned to
 * it — every piece of the conversation's work still live. One line collapsed, "4 working"; opened, a list that
 * scrolls. Absent when nothing is live. A request for the person's okay is not here: it is its card in the thread,
 * and the waiting strip above the box keeps it in view.
 */
export function WorkBar({ rows, liveLines, actions, workflowRuns = [] }: {
  rows: OperationActivityView[]
  liveLines: LiveLines
  actions: WorkBarActions
  /** The workflow runs this conversation started: those under way are work; a finished one has its card in the thread. */
  workflowRuns?: ConversationRunCard[]
}) {
  const bar = workBar(rows)
  const [open, setOpen] = useState(false)
  const runs = workflowRuns.filter(isRunActive)
  if (bar.others.length + runs.length === 0) return null
  return (
    <section
      aria-label="Work under way"
      data-testid="work-bar"
      className="overflow-hidden rounded-xl border border-border bg-surface-1"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-small max-lg:min-h-10"
      >
        <Loader2 size={12} aria-hidden className="shrink-0 text-accent motion-safe:animate-spin" />
        <span className="min-w-0 flex-1 truncate font-medium text-text-primary" data-testid="work-bar-heading">
          {barHeading({ working: bar.others.length + runs.length, needYou: 0 })}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-text-muted">
          {open ? 'Hide' : 'Show'}
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
        </span>
      </button>
      {open && (
        <ul className="max-h-80 divide-y divide-border-subtle overflow-y-auto border-t border-border-subtle" data-testid="work-bar-list">
          {bar.others.map((r) => <WorkRow key={r.operationId} row={r} live={liveLines[r.operationId]} actions={actions} />)}
          {runs.map((c) => <WorkflowRunRow key={c.runId} card={c} />)}
        </ul>
      )}
    </section>
  )
}
