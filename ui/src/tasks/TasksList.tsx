import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { Button } from '../primitives/Button'
import { EmptyState } from '../primitives/EmptyState'
import type { TaskListColumn, TaskListFieldOption, TaskListKind, TaskListRow as Row } from './taskListTypes'
import { TaskListRow, type RowSelection } from './TaskListRow'
import { columnLabel, columnsTemplate } from './taskListColumns'
import { groupByDue } from './taskListWords'
import { TaskGroupHeading } from './TasksToolParts'

/** Where a dragged line goes: just after the line it was dropped on, or just before it. */
export type RankPlace = { afterTaskId: string } | { beforeTaskId: string }

export interface TasksListProps {
  rows: Row[]
  kind: TaskListKind
  now: Date
  onOpen: (row: Row) => void
  /** A click on a ringed avatar opens the run. */
  onOpenRun?: (row: Row) => void
  emptyText: string
  /** Beside the empty list's words: what to do about it, such as clearing the search and filters. */
  emptyAction?: ReactNode
  /** The wide line's columns, in order; Column, Agent and Due when not given. */
  columns?: readonly TaskListColumn[]
  /** The project's custom fields, for their columns' names. */
  fields?: TaskListFieldOption[]
  /** The rows are an epic's own tasks: the epic is not repeated on each. */
  underEpic?: boolean
  /** Planning epics: an epic's line counts its tasks by state. */
  byState?: boolean
  /** Your tasks sorted by due date: breaks by when (Late, This week, Next week, Later, No date). */
  dueGroups?: boolean
  /** Lines can be ticked (T4's actions on a selection). */
  selection?: {
    selected: ReadonlySet<string>
    /** The tick boxes show even before anything is ticked (the planning view on a wide screen). */
    boxes: boolean
    onToggle: (row: Row) => void
    onLongPress: (row: Row) => void
  }
  /** Given while sorted by Rank, for someone who may: a line's handle drags it to a new place in the order (D14). */
  onMove?: (row: Row, place: RankPlace) => void
  /** More rows than shown: Show more asks for them. */
  hasMore?: boolean
  onShowMore?: () => void
}

function DraggableRow({ row, children }: { row: Row; children: (drag: NonNullable<Parameters<typeof TaskListRow>[0]['drag']>) => ReactNode }) {
  const draggable = useDraggable({ id: row.id })
  const droppable = useDroppable({ id: row.id })
  const t = draggable.transform
  const style: CSSProperties | undefined = t ? { transform: `translate3d(0, ${t.y}px, 0)`, zIndex: 20, position: 'relative' } : undefined
  return <>{children({
    handle: { ...draggable.attributes, ...draggable.listeners },
    setRowRef: el => { draggable.setNodeRef(el); droppable.setNodeRef(el) },
    setHandleRef: draggable.setActivatorNodeRef,
    style: draggable.isDragging ? { ...style, opacity: 0.6 } : style,
    over: droppable.isOver && !draggable.isDragging,
  })}</>
}

/** The lines while they can be dragged: a pointer moved a little, or the keyboard, picks one up. */
function Ranked({ onDragEnd, children }: { onDragEnd: (e: DragEndEvent) => void; children: ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor))
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <ul className="divide-y divide-border-subtle">{children}</ul>
    </DndContext>
  )
}

/**
 * The task lists' one list (T2): a header naming the chosen columns, then one line per task in the chosen order.
 * Your tasks sorted by due date breaks it by when. The header, the dividers and the lines' words sit on the page's
 * 16 px gutter; only a line's hover fill reaches past it.
 */
export function TasksList(props: TasksListProps) {
  const columns = props.columns ?? ['column', 'agent', 'due']
  const fields = props.fields ?? []
  const [order, setOrder] = useState(props.rows)
  // A drop shows at once; the next answer from hq is the order.
  useEffect(() => { setOrder(props.rows) }, [props.rows])

  if (props.rows.length === 0) {
    return (
      <div className="px-4">
        <EmptyState variant="inline" title={props.emptyText} action={props.emptyAction} />
      </div>
    )
  }

  const sel = props.selection
  const selecting = !!sel && sel.selected.size > 0
  const boxes = !!sel && (sel.boxes || selecting)
  const template = columnsTemplate(columns, boxes)

  const selectionOf = (row: Row): RowSelection | undefined => sel && {
    selecting, selected: sel.selected.has(row.id), showBox: boxes,
    onToggle: () => sel.onToggle(row), onLongPress: () => sel.onLongPress(row),
  }

  const line = (row: Row, drag?: Parameters<typeof TaskListRow>[0]['drag']) => (
    <TaskListRow
      key={row.id} row={row} kind={props.kind} now={props.now} columns={columns} onOpen={props.onOpen}
      onOpenRun={props.onOpenRun} underEpic={props.underEpic} byState={props.byState} selection={selectionOf(row)} drag={drag}
    />
  )

  const onDragEnd = (e: DragEndEvent) => {
    if (!props.onMove || !e.over || e.over.id === e.active.id) return
    const from = order.findIndex(r => r.id === e.active.id)
    const to = order.findIndex(r => r.id === e.over!.id)
    if (from < 0 || to < 0) return
    const moved = order[from]
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, moved)
    setOrder(next)
    props.onMove(moved, from < to ? { afterTaskId: String(e.over.id) } : { beforeTaskId: String(e.over.id) })
  }

  const body = props.dueGroups ? (
    groupByDue(order, props.now).map(g => (
      <div key={g.group} role="group" aria-label={g.group}>
        <div className="pb-1 pt-4"><TaskGroupHeading count={g.rows.length}>{g.group}</TaskGroupHeading></div>
        <ul className="divide-y divide-border-subtle">{g.rows.map(r => line(r))}</ul>
      </div>
    ))
  ) : props.onMove ? (
    <Ranked onDragEnd={onDragEnd}>
      {order.map(row => <DraggableRow key={row.id} row={row}>{drag => line(row, drag)}</DraggableRow>)}
    </Ranked>
  ) : (
    <ul className="divide-y divide-border-subtle">{order.map(r => line(r))}</ul>
  )

  return (
    <div className="@container px-4" style={{ '--task-wide': template } as CSSProperties}>
      <div
        data-testid="list-header"
        className="hidden gap-x-3 border-b border-border-subtle py-2 text-micro font-medium uppercase tracking-wide text-text-muted @2xl:grid @2xl:[grid-template-columns:var(--task-wide)]"
      >
        {boxes && <span />}
        <span>Task</span>
        {columns.map(c => <span key={c} className="truncate">{columnLabel(c, fields)}</span>)}
      </div>
      {body}
      {props.hasMore && props.onShowMore && (
        <div className="py-3"><Button variant="secondary" onClick={props.onShowMore}>Show more</Button></div>
      )}
    </div>
  )
}
