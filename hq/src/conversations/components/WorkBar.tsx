import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ChevronUp, Loader2, ShieldQuestion } from 'lucide-react'
import { contextShare, type ContextUse } from '@agenthix/core'
import type { OperationActivityView } from '../../shared/conversations/protocol'
import { stateWord, type LiveLines } from '../hooks/activityState'
import { barHeading, workBar } from '../hooks/workBarState'
import { WorkflowRequestRow } from './WorkflowRequestRow'

/** How much of the background session's context its work has filled, as the runtime last reported it. */
export function contextLine(use: ContextUse | null | undefined): string | null {
  return use ? `Context ${contextShare(use).percent}% full` : null
}

export type WorkBarActions = {
  /** Whether the viewer may speak here: only they can answer a request or stop work. */
  canAct: boolean
  busy: boolean
  onStop: (operationId: string) => void
  onAnswer: (operationId: string, answer: 'approve' | 'decline', note?: string) => void
}

const BUTTON = 'rounded-lg px-3 py-1 text-small font-medium disabled:opacity-50 max-lg:min-h-10'

function Title({ row }: { row: OperationActivityView }) {
  const title = <span className="font-medium text-text-primary">{row.title}</span>
  return row.runHref ? <Link to={row.runHref} className="hover:underline">{title}</Link> : title
}

/** A request for the person's okay: what would run, for which work, why, then Approve or Decline with a note. */
function RequestRow({ row, actions }: { row: OperationActivityView; actions: WorkBarActions }) {
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState('')
  const what = row.request?.what || row.title
  return (
    <li className="bg-warning/5 px-3 py-2" data-testid="work-bar-request">
      <div className="flex items-start gap-2">
        <ShieldQuestion size={14} aria-hidden className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 text-small">
          <p className="break-words">
            <span className="font-semibold text-text-primary">{what}</span>
            {what !== row.title && <span className="text-text-muted"> · <Title row={row} /></span>}
          </p>
          {row.request?.reason && <p className="text-micro text-text-secondary">{row.request.reason}</p>}
          {!actions.canAct ? (
            <p className="mt-1 text-micro text-text-muted">Waiting for someone who can write here to answer</p>
          ) : declining ? (
            <div className="mt-1.5 space-y-1.5">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Say why, if you like"
                rows={2}
                aria-label="Why you decline"
                className="w-full resize-none rounded-lg border border-border bg-surface-1 px-3 py-2 text-small text-text-primary focus:border-accent focus:outline-none"
              />
              <div className="flex gap-2">
                <button type="button" disabled={actions.busy} onClick={() => actions.onAnswer(row.operationId, 'decline', note.trim() || undefined)} className={`${BUTTON} bg-button-danger text-button-danger-text`}>
                  Decline
                </button>
                <button type="button" onClick={() => setDeclining(false)} className={`${BUTTON} text-text-secondary hover:text-text-primary`}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex gap-2">
              <button type="button" disabled={actions.busy} onClick={() => actions.onAnswer(row.operationId, 'approve')} className={`${BUTTON} bg-accent text-on-accent hover:bg-accent-hover`}>
                Approve
              </button>
              <button type="button" disabled={actions.busy} onClick={() => setDeclining(true)} className={`${BUTTON} border border-border bg-surface-1 text-text-primary hover:bg-surface-hover`}>
                Decline
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
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
 * it — every piece of the conversation's work still live and every request for the person's okay. One line
 * collapsed, "4 working · 2 need you"; opened, a list that scrolls, requests first. Absent when nothing is live.
 * It opens by itself when a new request arrives.
 */
export function WorkBar({ rows, liveLines, actions }: { rows: OperationActivityView[]; liveLines: LiveLines; actions: WorkBarActions }) {
  const bar = workBar(rows)
  const [open, setOpen] = useState(false)
  const asked = useRef(bar.needYou)
  useEffect(() => {
    if (bar.needYou > asked.current) setOpen(true)
    asked.current = bar.needYou
  }, [bar.needYou])
  if (bar.working === 0) return null
  const attention = bar.needYou > 0
  return (
    <section
      aria-label="Work under way"
      data-testid="work-bar"
      className={`overflow-hidden rounded-xl border bg-surface-1 ${attention ? 'border-warning/50' : 'border-border'}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-small max-lg:min-h-10"
      >
        <Loader2 size={12} aria-hidden className="shrink-0 text-accent motion-safe:animate-spin" />
        <span className={`min-w-0 flex-1 truncate font-medium ${attention ? 'text-warning' : 'text-text-primary'}`} data-testid="work-bar-heading">
          {barHeading(bar)}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-text-muted">
          {open ? 'Hide' : 'Show'}
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
        </span>
      </button>
      {open && (
        <ul className="max-h-80 divide-y divide-border-subtle overflow-y-auto border-t border-border-subtle" data-testid="work-bar-list">
          {bar.requests.map((r) => (r.workflowCard
            ? <WorkflowRequestRow key={r.operationId} row={r} card={r.workflowCard} actions={actions} />
            : <RequestRow key={r.operationId} row={r} actions={actions} />))}
          {bar.others.map((r) => <WorkRow key={r.operationId} row={r} live={liveLines[r.operationId]} actions={actions} />)}
        </ul>
      )}
    </section>
  )
}
