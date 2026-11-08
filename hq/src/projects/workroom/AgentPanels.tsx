import { Link } from 'react-router'
import { ChevronRight, Clock, Square } from 'lucide-react'
import { Tooltip } from '@agenthix/ui/primitives'
import type { WorkroomAgent, WorkroomNow } from './workroomTypes'
import { agoText, elapsedText, lineWhyText, pausedNeeds } from './workroomWords'

const HEAD = 'mb-1 text-micro font-medium uppercase tracking-wide text-text-muted'
const KEY = 'shrink-0 font-mono text-micro text-text-muted'
const LINK = 'rounded text-small text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
const ICON_BUTTON = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 max-sm:h-11 max-sm:w-11'

function nowTitle(r: WorkroomNow): string {
  if (r.kind === 'task') return r.title ?? 'A task'
  return r.title ? `A reply in “${r.title}”` : 'A reply in a conversation'
}

function NowRun({ run, now, onStop, stopWhy }: { run: WorkroomNow; now: Date; onStop?: (run: WorkroomNow) => void; stopWhy?: string }) {
  const facts = run.kind === 'task'
    ? [run.runNumber ? `Run ${run.runNumber}` : null, run.startedBy ? `started by ${run.startedBy}` : null].filter(Boolean).join(' · ')
    : 'a reply in a conversation'
  const title = nowTitle(run)
  return (
    <div className="min-w-0 [&+&]:mt-2">
      <div className="flex min-w-0 items-center gap-1">
        {run.href
          ? <Link to={run.href} className="min-w-0 flex-1 truncate font-medium text-text-primary hover:underline">{title}</Link>
          : <b className="min-w-0 flex-1 truncate font-medium">{title}</b>}
        {run.since && <span className="mr-1 shrink-0 text-small tabular-nums text-text-muted">{elapsedText(run.since, now)}</span>}
        {onStop && (
          <Tooltip label={stopWhy ?? 'Stop this run'} side="top">
            <button type="button" aria-label="Stop this run" disabled={!!stopWhy} onClick={() => onStop(run)} className={ICON_BUTTON}>
              <Square size={14} aria-hidden className="fill-current" />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="mt-0.5 truncate text-micro text-text-muted">
        {run.taskKey && <span className={KEY}>{run.taskKey}</span>}
        {run.taskKey && facts && ' · '}
        {facts}
      </div>
    </div>
  )
}

/**
 * A scorecard's three panels (the Workroom design): **Now** (each run at work, how long it has gone, its Stop; else
 * the runs paused for the person's okay or answer — a failed run is finished, so only its bar shows it), **In
 * line** in rank order with why each waits, and **Finished today** with its last. An empty Now or In line is left out;
 * on a phone they stack.
 */
export function AgentPanels({ agent, now, onStopRun, stopWhy, short = false }: {
  agent: WorkroomAgent
  now: Date
  onStopRun?: (run: WorkroomNow) => void
  /** Why the runs cannot be stopped from here, when they cannot. */
  stopWhy?: string
  /** The phone's shorter words. */
  short?: boolean
}) {
  const paused = pausedNeeds(agent)
  const showNow = agent.now.length > 0 || paused.length > 0
  const panels = [
    showNow && (
      <div key="now" className="min-w-0 px-4 py-3 max-sm:px-3">
        <div className={HEAD}>Now</div>
        {agent.now.length > 0
          ? agent.now.map(r => <NowRun key={r.key} run={r} now={now} onStop={onStopRun} stopWhy={stopWhy} />)
          : <p className="truncate text-small text-text-muted">Waiting for you ({paused.map(n => n.taskKey).join(', ')})</p>}
      </div>
    ),
    agent.line.length > 0 && (
      <div key="line" className="min-w-0 px-4 py-3 max-sm:px-3">
        <div className={HEAD}>In line · rank order</div>
        <ol>
          {agent.line.map((t, i) => (
            <li key={t.taskId} className="grid min-w-0 grid-cols-[16px_1fr] gap-2 py-1 [&+&]:mt-1">
              <span className="text-micro leading-[var(--text-body--line-height)] tabular-nums text-text-muted">{i + 1}</span>
              <div className="min-w-0">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className={KEY}>{t.taskKey}</span>
                  <Link to={t.href} className="min-w-0 truncate font-medium text-text-primary hover:underline">{t.title}</Link>
                </div>
                <div className="text-micro text-text-muted">
                  {t.why.kind === 'startsAt' && <Clock size={12} aria-hidden className="mr-1 inline align-[-2px]" />}
                  {lineWhyText(t.why, short)}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    ),
    agent.finishedToday > 0 && (
      <div key="finished" className="min-w-0 px-4 py-3 max-sm:px-3">
        <div className={HEAD}>Finished today</div>
        <b className="block font-medium">{agent.finishedToday} {agent.finishedToday === 1 ? 'run' : 'runs'}</b>
        {agent.lastFinished && (() => {
          const what = agent.lastFinished.kind === 'reply'
            ? (agent.lastFinished.title ? `a reply in “${agent.lastFinished.title}”` : 'a reply in a conversation')
            : agent.lastFinished.title ?? 'a task'
          const words = short ? `last: ${what}` : `last: ${what}, ${agoText(agent.lastFinished.at, now)}`
          return agent.lastFinished.href
            ? <Link to={agent.lastFinished.href} className={`${LINK} inline-flex max-w-full items-center`}><span className="truncate">{words}</span><ChevronRight size={14} aria-hidden className="shrink-0" /></Link>
            : <span className="block truncate text-small text-text-muted">{words}</span>
        })()}
      </div>
    ),
  ].filter(Boolean)
  if (panels.length === 0) return null
  // Three panels side by side, Now and In line the wider; fewer share the row.
  const cols = panels.length === 3 ? 'lg:grid-cols-[1.25fr_1.25fr_1fr]' : panels.length === 2 ? 'lg:grid-cols-[1.25fr_1fr]' : 'lg:grid-cols-1'
  return (
    <div className={`grid grid-cols-1 border-t border-border-subtle ${cols} max-lg:divide-y lg:divide-x divide-border-subtle`}>
      {panels}
    </div>
  )
}
