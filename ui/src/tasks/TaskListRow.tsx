import { useRef, type CSSProperties, type ReactNode } from 'react'
import { Check, Folder, GripVertical } from 'lucide-react'
import { FOCUS_RING } from '../primitives/controlStyles'
import { ProgressRing } from './TaskMarks'
import { TaskTypeMark } from './TaskTypeMark'
import { AgentMark, ColumnChip, DueMark, EpicFact, PriorityMark, TaskSprintTag } from './TaskListCells'
import { rowLine } from './taskListWords'
import { fieldIdOf } from './taskListColumns'
import type { TaskListColumn, TaskListKind, TaskListRow as Row } from './taskListTypes'

/** How long a touch is held before it starts selecting (the phone's way in to selection mode). */
const LONG_PRESS_MS = 500

export interface RowSelection {
  /** Some line is ticked: a tap on a line ticks it, in place of opening it. */
  selecting: boolean
  selected: boolean
  /** The tick box shows (the planning view on a wide screen, and wherever lines are being ticked). */
  showBox: boolean
  onToggle: () => void
  /** A touch held on the line: selection mode starts with it ticked. */
  onLongPress: () => void
}

export interface TaskListRowProps {
  row: Row
  kind: TaskListKind
  now: Date
  /** The wide line's columns, in order (Fields ▾). */
  columns: readonly TaskListColumn[]
  onOpen: (row: Row) => void
  /** A click on a ringed avatar: the run. */
  onOpenRun?: (row: Row) => void
  /** Listed under its epic (the epic's page): the epic is not repeated on the line. */
  underEpic?: boolean
  /** Planning epics: an epic's line counts its tasks by state. */
  byState?: boolean
  selection?: RowSelection
  /** Dragged to change the rank (sorted by Rank, for someone who may): the handle and the drop target's props. */
  drag?: { handle: Record<string, unknown>; setRowRef: (el: HTMLElement | null) => void; setHandleRef: (el: HTMLElement | null) => void; style?: CSSProperties; over: boolean }
}

function Cell({ column, row, now, onOpenRun }: { column: TaskListColumn; row: Row; now: Date; onOpenRun?: (row: Row) => void }) {
  const fieldId = fieldIdOf(column)
  if (fieldId) {
    const value = row.fields[fieldId]
    return <span className={`truncate text-small ${value ? 'text-text-secondary' : 'text-text-muted'}`}>{value?.name ?? '—'}</span>
  }
  switch (column) {
    case 'column': return <div className="min-w-0"><ColumnChip name={row.column.name} /></div>
    case 'agent': return <AgentMark row={row} withName onOpenRun={onOpenRun} />
    case 'due': return <DueMark row={row} now={now} dash />
    case 'sprint': return row.sprint ? <div className="min-w-0"><TaskSprintTag name={row.sprint.name} /></div> : <span className="text-small text-text-muted">—</span>
    case 'priority': return <div><PriorityMark priority={row.priority} /></div>
    default: return null
  }
}

function TickBox({ selection, label }: { selection: RowSelection; label: string }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={selection.selected} aria-label={`Select ${label}`} onClick={selection.onToggle}
      className={`relative z-10 -m-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md max-sm:-m-2.5 max-sm:h-11 max-sm:w-11 ${FOCUS_RING}`}
    >
      <span aria-hidden className={`flex h-4 w-4 items-center justify-center rounded border ${selection.selected ? 'border-accent bg-accent text-on-accent' : 'border-border-strong bg-surface-1'}`}>
        {selection.selected && <Check size={12} strokeWidth={3} />}
      </span>
    </button>
  )
}

/**
 * One task on a list (T2): its type's mark and title, then under it the priority, epic and sprint and the quiet line
 * (key · type · when it changed). On a wide list each chosen column stands beside it (Column by name, the agent with
 * the run as its ring, Due); narrower, the column, the agent's avatar and the date go on line 2. No run words and no
 * run buttons: what an agent is doing is the ring (D18), and running is on a board or a task (D6). The title is the
 * button that opens the task, stretched over the line; while lines are ticked, it ticks this one instead.
 */
export function TaskListRow(props: TaskListRowProps) {
  const { row, kind, now, columns, selection, drag } = props
  const press = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressed = useRef(false)
  const cancelPress = () => { if (press.current) clearTimeout(press.current); press.current = null }
  const showBox = !!selection?.showBox
  const tinted = selection?.selected

  const open = () => {
    if (pressed.current) { pressed.current = false; return }
    if (selection?.selecting) selection.onToggle()
    else props.onOpen(row)
  }

  const isEpic = row.type.kind === 'EPIC'
  const marks: ReactNode = (
    <>
      {isEpic && row.progress && <ProgressRing done={row.progress.done} total={row.progress.total} />}
      {!isEpic && kind !== 'mine' && <PriorityMark priority={row.priority} />}
      {row.epic && !isEpic && !props.underEpic && <EpicFact title={row.epic.title} />}
      {row.sprint && <TaskSprintTag name={row.sprint.name} />}
    </>
  )

  return (
    <li
      ref={drag?.setRowRef}
      style={drag?.style}
      className={`group relative ${drag?.over ? 'shadow-[inset_0_2px_0_var(--color-accent)]' : ''}`}
      onPointerDown={e => {
        pressed.current = false
        if (e.pointerType !== 'touch' || !selection || selection.selecting) return
        cancelPress()
        press.current = setTimeout(() => { pressed.current = true; selection.onLongPress() }, LONG_PRESS_MS)
      }}
      onPointerUp={cancelPress} onPointerCancel={cancelPress} onPointerLeave={cancelPress} onPointerMove={e => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 4) cancelPress() }}
      onContextMenu={e => { if (selection && pressed.current) e.preventDefault() }}
    >
      {drag && (
        <button
          type="button" ref={drag.setHandleRef} {...drag.handle} aria-label={`Move ${row.key} in the order`}
          className={`absolute -left-3.5 top-1/2 z-10 hidden -translate-y-1/2 cursor-grab rounded text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 @2xl:block ${FOCUS_RING}`}
        >
          <GripVertical size={14} aria-hidden />
        </button>
      )}
      <div
        data-testid="task-line"
        className={`relative -mx-2 grid items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5 max-sm:min-h-11 ${tinted ? 'bg-selected' : 'hover:bg-surface-hover'} ${showBox ? 'grid-cols-[24px_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]'} @2xl:[grid-template-columns:var(--task-wide)]`}
      >
        {showBox && selection && <TickBox selection={selection} label={row.title} />}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <TaskTypeMark type={row.type} />
            <button
              type="button" onClick={open} aria-pressed={selection?.selecting ? selection.selected : undefined}
              className="min-w-0 truncate text-left text-body font-medium text-text-primary focus-visible:outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent"
            >
              {row.title}
            </button>
          </div>
          {/* Wide: the marks and the quiet line. Narrow: the column, the agent and the date. */}
          <div className="mt-0.5 hidden min-w-0 items-center gap-1.5 pl-[22px] text-micro text-text-muted @2xl:flex">
            {kind === 'mine' && <span data-testid="row-project" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-text-secondary"><Folder size={12} aria-hidden />{row.project.name}</span>}
            {marks}
            <span className="min-w-0 truncate">{rowLine(row, now, { kind, byState: props.byState })}</span>
          </div>
          <div data-testid="line-narrow" className="mt-1 flex min-w-0 items-center gap-2 pl-[22px] @2xl:hidden">
            {kind === 'mine' && <span data-testid="row-project-narrow" className="inline-flex min-w-0 shrink-0 items-center gap-1 text-micro font-medium text-text-secondary"><Folder size={12} aria-hidden className="shrink-0" /><span className="truncate">{row.project.name}</span></span>}
            {isEpic && row.progress && <ProgressRing done={row.progress.done} total={row.progress.total} />}
            <ColumnChip name={row.column.name} />
            {row.agent && <AgentMark row={row} withName={false} onOpenRun={props.onOpenRun} />}
            <DueMark row={row} now={now} dash={false} />
          </div>
        </div>
        {columns.map(c => (
          <div key={c} className="hidden min-w-0 @2xl:block">
            <Cell column={c} row={row} now={now} onOpenRun={props.onOpenRun} />
          </div>
        ))}
      </div>
    </li>
  )
}
