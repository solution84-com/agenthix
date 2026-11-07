import type { ReactNode } from 'react'
import { AgentAvatar } from '../sessions/SessionComponents'
import { Button } from '../primitives/Button'
import { taskStateWords, type TaskNextStep } from './taskStateWords'
import type { StateTone } from './taskGroups'
import type { TaskListKind, TaskListRow as Row } from './taskListTypes'
import { rowChips, rowLine, type RowChip } from './taskListWords'
import { EpicBadge, PriorityFlag, ProgressRing } from './TaskMarks'
import { CalendarGlyph } from '../primitives/Glyphs'

function FolderGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-text-muted">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  )
}


const TONE: Record<StateTone, string> = { needs: 'text-warning', live: 'text-success', muted: 'text-text-muted' }

// The column is the one chip (outlined); every other fact beside the title is its own kind of mark, so no two kinds
// look alike: the project in words, the priority a flag, an epic's date a calendar.
const COLUMN_CHIP = 'shrink-0 whitespace-nowrap rounded-full px-2 text-micro leading-[18px] ring-1 ring-inset ring-border bg-surface-1 text-text-primary'
const FACT = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-micro leading-[18px] text-text-secondary'

/** The row's grid: the task, who has it and where it stands, and its next step. Shared with the list's column header. */
export const TASK_ROW_GRID = 'grid-cols-[minmax(0,1fr)_auto] @2xl:grid-cols-[minmax(0,1fr)_minmax(10rem,16rem)_6.5rem]'

export interface TaskListRowProps {
  row: Row
  kind: TaskListKind
  now: Date
  onOpen: (row: Row) => void
  onNextStep: (row: Row, step: TaskNextStep) => void
  /** Assign, in place of a next step, for work with no agent to start it. */
  renderAssign: (row: Row) => ReactNode
  /** False (a project Viewer) shows the next step greyed, with `cannotActReason` as its tooltip. */
  mayAct: boolean
  cannotActReason?: string
  /** Listed under its epic (the epic's page): the epic is not repeated on the row. */
  underEpic?: boolean
}

function AgentAndState({ row, now, mayAct, cannotActReason, onNextStep, renderAssign }: Omit<TaskListRowProps, 'kind' | 'onOpen' | 'underEpic'>) {
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
        {row.agent
          ? <AgentAvatar name={row.agent.name} size="sm" />
          : <span aria-hidden data-testid="no-agent" className="h-6 w-6 shrink-0 rounded-full border border-dashed border-border" />}
        <span className={`truncate ${TONE[words.tone]}`} title={words.fullReason ?? words.text}>{words.text}</span>
      </div>
      <div className="relative z-10 justify-self-end">
        {mayAct && row.waitsForAgent ? renderAssign(row) : step ? (
          <Button
            variant="secondary"
            disabled={!mayAct} title={mayAct ? undefined : cannotActReason}
            onClick={() => onNextStep(row, step)}
          >
            {words.nextStepLabel}
          </Button>
        ) : null}
      </div>
    </>
  )
}

/**
 * One task in a list (T7 ②): the title with its column and priority on one line that never wraps, and one quiet line
 * under it (the epic it belongs to, its key, board and when it changed); who has it and where it stands in their own
 * column, with the next step beside it. An epic is the same line, marked Epic, with its progress as a ring. The title
 * is the button that opens the task, stretched over the row, so the next step is a control of its own beside it.
 */
export function TaskListRow(props: TaskListRowProps) {
  const { row, kind, now, onOpen } = props
  const chips = rowChips(row, kind)
  const chip = (c: RowChip) => {
    switch (c.kind) {
      case 'priority': return <PriorityFlag key={c.kind} priority={row.priority} label={c.text} />
      case 'column': return <span key={c.kind} className={COLUMN_CHIP}>{c.text}</span>
      case 'project': return <span key={c.kind} data-testid="row-project" className={`${FACT} font-medium`}><FolderGlyph />{c.text}</span>
      case 'date': return <span key={c.kind} data-testid="row-date" className={FACT}><CalendarGlyph size={11} />{c.text}</span>
      case 'epic': return null
    }
  }
  const marks = (
    <>
      {row.isEpic && row.progress && <ProgressRing done={row.progress.done} total={row.progress.total} />}
      {chips.map(chip)}
    </>
  )
  return (
    <li>
      <div className={`relative -mx-2 grid items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5 hover:bg-surface-hover ${TASK_ROW_GRID}`}>
        <div className="col-span-2 min-w-0 @2xl:col-span-1">
          {/* One shape for every row, by the list's width: on a wide list the marks sit beside the title; narrower, every
              row puts them first on line 2, so the title keeps line 1 to itself. */}
          <div className="flex min-w-0 items-center gap-x-2">
            <button
              type="button"
              onClick={() => onOpen(row)}
              className="min-w-0 truncate text-left text-body font-medium text-text-primary focus-visible:outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent"
            >
              {row.title}
            </button>
            <span className="hidden shrink-0 items-center gap-2 @4xl:flex">{marks}</span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-micro text-text-muted">
            <span data-testid="row-marks-below" className="flex shrink-0 items-center gap-2 @4xl:hidden">{marks}</span>
            {row.isEpic && <EpicBadge />}
            {row.epic && !row.isEpic && !props.underEpic && <span className="min-w-0 max-w-[50%] shrink-0 truncate text-text-secondary">◆ {row.epic.title} ·</span>}
            <span className="min-w-0 truncate">{rowLine(row, now)}</span>
          </div>
        </div>
        <AgentAndState
          row={row} now={now} mayAct={props.mayAct} cannotActReason={props.cannotActReason}
          onNextStep={props.onNextStep} renderAssign={props.renderAssign}
        />
      </div>
    </li>
  )
}
