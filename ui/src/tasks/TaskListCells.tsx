import { Diamond } from 'lucide-react'
import { executionStateHasRing } from '@agenthix/core'
import { AgentAvatar } from '../sessions/SessionComponents'
import { CalendarGlyph } from '../primitives/Glyphs'
import { FOCUS_RING } from '../primitives/controlStyles'
import { RunAvatar } from './RunAvatar'
import { PriorityFlag } from './TaskMarks'
import { plainReason } from './taskGroups'
import { dueText } from './taskListWords'
import type { TaskListRow as Row } from './taskListTypes'

const PRIORITY_WORD: Record<string, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' }

/** The column, by name only: the one outlined chip on a line (spec, *Decided on the screens*). */
export function ColumnChip({ name }: { name: string }) {
  return (
    <span data-testid="column-chip" className="inline-block max-w-full shrink-0 truncate whitespace-nowrap rounded-full bg-surface-1 px-2 text-micro leading-[18px] text-text-primary ring-1 ring-inset ring-border">
      {name}
    </span>
  )
}

/** A sprint a task is planned in, outlined in the accent colour. */
export function TaskSprintTag({ name }: { name: string }) {
  return (
    <span data-testid="sprint-tag" className="shrink-0 whitespace-nowrap rounded-md border border-accent px-1.5 text-micro leading-4 text-accent">
      {name}
    </span>
  )
}

/** The epic a task belongs to: the epic's mark and its title, in words. */
export function EpicFact({ title }: { title: string }) {
  return (
    <span data-testid="epic-fact" className="inline-flex min-w-0 max-w-[40%] shrink items-center gap-1 whitespace-nowrap text-micro leading-[18px] text-text-secondary">
      <Diamond size={11} aria-hidden className="shrink-0 text-text-muted" />
      <span className="truncate">{title}</span>
    </span>
  )
}

export function PriorityMark({ priority }: { priority: Row['priority'] }) {
  return <PriorityFlag priority={priority} label={PRIORITY_WORD[priority] ?? priority} />
}

/**
 * Who has the task, with its run as the avatar's ring (D18): the words on hover, and a click on a ringed avatar opens
 * the run. No agent is an empty dashed circle. `withName` adds the agent's name beside it (the wide line).
 */
export function AgentMark({ row, withName, onOpenRun }: { row: Row; withName: boolean; onOpenRun?: (row: Row) => void }) {
  if (!row.agent) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-small">
        <span aria-hidden data-testid="no-agent" className="m-[3px] h-6 w-6 shrink-0 rounded-full border border-dashed border-border-strong" />
        {withName && <span className="truncate text-text-muted">No agent</span>}
      </span>
    )
  }
  const state = row.executionState
  const avatar = (
    <RunAvatar name={row.agent.name} state={state} detail={row.runDetail ? plainReason(row.runDetail) : null}>
      <AgentAvatar name={row.agent.name} size="sm" />
    </RunAvatar>
  )
  const ringed = !!state && executionStateHasRing(state) && !!onOpenRun
  return (
    <span className="flex min-w-0 items-center gap-2 text-small text-text-secondary">
      {ringed ? (
        <button type="button" aria-label={`Open the run of ${row.key}`} onClick={() => onOpenRun(row)} className={`relative z-10 shrink-0 rounded-full ${FOCUS_RING}`}>
          {avatar}
        </button>
      ) : avatar}
      {withName && <span className="truncate">{row.agent.name}</span>}
    </span>
  )
}

/** The day it is due, late in the danger colour with its mark; a dash with none (`dash`) or nothing. */
export function DueMark({ row, now, dash }: { row: Row; now: Date; dash: boolean }) {
  const text = dueText(row, now)
  if (!text) return dash ? <span className="text-small text-text-muted">—</span> : null
  return (
    <span data-testid="due" className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-small ${row.late ? 'text-danger' : 'text-text-secondary'}`}>
      {row.late && <CalendarGlyph size={11} />}
      {text}
    </span>
  )
}
