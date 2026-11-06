import type { ReactNode } from 'react'
import { Button } from '../primitives/Button'
import { EmptyState } from '../primitives/EmptyState'
import type { TaskNextStep } from './taskStateWords'
import type { TaskListKind, TaskListRow as Row } from './taskListTypes'
import { TASK_ROW_GRID, TaskListRow } from './TaskListRow'

export interface TasksListProps {
  rows: Row[]
  kind: TaskListKind
  now: Date
  onOpen: (row: Row) => void
  onNextStep: (row: Row, step: TaskNextStep) => void
  renderAssign: (row: Row) => ReactNode
  /** Whether the person may act on this task; false (a project Viewer) greys its next step. Default: yes. */
  mayAct?: (row: Row) => boolean
  /** Why the next step is greyed where the person may not act: its tooltip. */
  cannotActReason?: string
  emptyText: string
  /** Beside the empty list's words: what to do about it, such as clearing the search and filters. */
  emptyAction?: ReactNode
  /** The rows are an epic's own tasks: the epic is not repeated on each. */
  underEpic?: boolean
  /** More rows than shown: Show more asks for them. */
  hasMore?: boolean
  onShowMore?: () => void
}

/**
 * The task lists' one flat list (T7): no groups; the order and the slice are the person's to choose. The column
 * header, the rows' dividers and the rows' words sit on the page's 16 px gutter; only a row's hover fill reaches past it.
 */
export function TasksList(props: TasksListProps) {
  if (props.rows.length === 0) {
    return (
      <div className="px-4">
        <EmptyState variant="inline" title={props.emptyText} action={props.emptyAction} />
      </div>
    )
  }
  return (
    <div className="@container px-4">
      <div className={`hidden gap-x-3 border-b border-border-subtle py-1.5 text-micro font-medium uppercase tracking-wide text-text-muted @2xl:grid ${TASK_ROW_GRID}`}>
        <span>Task</span>
        <span>Agent · state</span>
        <span />
      </div>
      <ul className="divide-y divide-border-subtle">
        {props.rows.map(row => (
          <TaskListRow
            key={row.id} row={row} kind={props.kind} now={props.now} onOpen={props.onOpen} onNextStep={props.onNextStep}
            renderAssign={props.renderAssign} mayAct={props.mayAct ? props.mayAct(row) : true} cannotActReason={props.cannotActReason}
            underEpic={props.underEpic}
          />
        ))}
      </ul>
      {props.hasMore && props.onShowMore && (
        <div className="py-3"><Button variant="secondary" onClick={props.onShowMore}>Show more</Button></div>
      )}
    </div>
  )
}
