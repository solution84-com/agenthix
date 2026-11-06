import type { ReactNode } from 'react'
import { AgentAvatar } from '../sessions/SessionComponents'
import { Button } from '../primitives/Button'
import { taskStateWords, type TaskNextStep } from './taskStateWords'
import type { StateTone } from './taskGroups'
import type { TaskListKind, TaskListRow as Row } from './taskListTypes'
import { rowChips, rowLine, type RowChip } from './taskListWords'

const TONE: Record<StateTone, string> = { needs: 'text-warning', live: 'text-success', muted: 'text-text-muted' }

const CHIP: Record<RowChip['kind'], string> = {
  project: 'border border-border text-text-secondary',
  column: 'bg-chip text-text-primary',
  priority: 'bg-chip text-text-secondary',
  epic: 'bg-accent-subtle text-accent',
  date: 'bg-chip text-text-secondary',
}

/** An epic's progress as a ring: how much of its tasks are done. */
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 6
  const length = 2 * Math.PI * r
  const part = total === 0 ? 0 : done / total
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-micro text-text-secondary" aria-label={`${done} of ${total} done`}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="-rotate-90">
        <circle cx="8" cy="8" r={r} fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
        <circle cx="8" cy="8" r={r} fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeDasharray={`${part * length} ${length}`} />
      </svg>
      {done} / {total}
    </span>
  )
}

export interface TaskListRowProps {
  row: Row
  kind: TaskListKind
  now: Date
  onOpen: (row: Row) => void
  onNextStep: (row: Row, step: TaskNextStep) => void
  /** Assign, in place of a next step, for work with no agent to start it. */
  renderAssign: (row: Row) => ReactNode
  /** False (a project Viewer) leaves the row with no next step. */
  mayAct: boolean
}

function AgentAndState({ row, now, mayAct, onNextStep, renderAssign }: Omit<TaskListRowProps, 'kind' | 'onOpen'>) {
  if (row.isEpic) return null
  const words = row.waitsForAgent
    ? { text: 'Couldn’t start · no agent', tone: 'needs' as const, fullReason: null, nextStep: null, nextStepLabel: null }
    : taskStateWords({
      runState: row.runState, runStateReason: row.runStateReason, done: row.status === 'DONE', waitsOn: row.waitsOn,
      workingSince: row.workingSince, latestRunCompleted: row.latestRunCompleted,
    }, now)
  const step = words.nextStep
  return (
    <>
      <div className="flex min-w-0 items-center gap-1.5 text-small">
        {row.agent && <AgentAvatar name={row.agent.name} size="sm" />}
        <span className={`truncate ${TONE[words.tone]}`} title={words.fullReason ?? words.text}>{words.text}</span>
      </div>
      <div className="justify-self-end" onClick={e => e.stopPropagation()}>
        {mayAct && row.waitsForAgent ? renderAssign(row) : mayAct && step ? (
          <Button variant="secondary" size="sm" onClick={() => onNextStep(row, step)}>{words.nextStepLabel}</Button>
        ) : null}
      </div>
    </>
  )
}

/**
 * One task in a list (T7 ②): the title, its chips, and one quiet line under it; who has it and where it stands in
 * their own column, with the next step beside it. An epic is the same line, marked Epic, with its progress as a ring.
 */
export function TaskListRow(props: TaskListRowProps) {
  const { row, kind, now, onOpen } = props
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(row)}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen(row) }
        }}
        className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 hover:bg-surface-hover @2xl:grid-cols-[minmax(0,1fr)_minmax(10rem,16rem)_6.5rem]"
      >
        <div className="col-span-2 min-w-0 @2xl:col-span-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 text-body font-medium text-text-primary">{row.title}</span>
            {row.isEpic && row.progress && <ProgressRing done={row.progress.done} total={row.progress.total} />}
            {rowChips(row, kind).map(chip => (
              <span key={chip.kind} className={`whitespace-nowrap rounded-full px-2 text-micro leading-[18px] ${CHIP[chip.kind]}`}>{chip.text}</span>
            ))}
          </div>
          <p className="mt-0.5 truncate text-micro text-text-muted">
            {row.isEpic && <span className="mr-1.5 rounded border border-border px-1 font-medium text-text-secondary">Epic</span>}
            {rowLine(row, now)}
          </p>
        </div>
        <AgentAndState row={row} now={now} mayAct={props.mayAct} onNextStep={props.onNextStep} renderAssign={props.renderAssign} />
      </div>
    </li>
  )
}
