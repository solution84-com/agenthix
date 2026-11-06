import type { ReactNode } from 'react'
import { Button } from '../primitives/Button'
import type { TaskNextStep } from './taskStateWords'
import type { TaskListKind, TaskListRow as Row } from './taskListTypes'
import { TaskListRow } from './TaskListRow'

export interface TasksListProps {
  rows: Row[]
  kind: TaskListKind
  now: Date
  onOpen: (row: Row) => void
  onNextStep: (row: Row, step: TaskNextStep) => void
  renderAssign: (row: Row) => ReactNode
  /** Whether the person may act on this task; false (a project Viewer) leaves its row with no next step. Default: yes. */
  mayAct?: (row: Row) => boolean
  emptyText: string
  /** More rows than shown: Show more asks for them. */
  hasMore?: boolean
  onShowMore?: () => void
}

/** The task lists' one flat list (T7): no groups; the order and the slice are the person's to choose. */
export function TasksList(props: TasksListProps) {
  return (
    <div className="@container">
      <div className="hidden gap-x-3 border-b border-border-subtle px-4 py-1.5 text-micro font-medium uppercase tracking-wide text-text-muted @2xl:grid @2xl:grid-cols-[minmax(0,1fr)_minmax(10rem,16rem)_6.5rem]">
        <span>Task</span>
        <span>Agent · state</span>
        <span />
      </div>
      {props.rows.length === 0 && <p className="px-4 py-6 text-small text-text-muted">{props.emptyText}</p>}
      <ul className="divide-y divide-border-subtle">
        {props.rows.map(row => (
          <TaskListRow
            key={row.id} row={row} kind={props.kind} now={props.now} onOpen={props.onOpen} onNextStep={props.onNextStep}
            renderAssign={props.renderAssign} mayAct={props.mayAct ? props.mayAct(row) : true}
          />
        ))}
      </ul>
      {props.hasMore && props.onShowMore && (
        <div className="px-4 py-3"><Button variant="secondary" size="sm" onClick={props.onShowMore}>Show more</Button></div>
      )}
    </div>
  )
}
