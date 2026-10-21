import { useState, type ReactNode } from 'react'
import { AgentAvatar } from '../sessions/SessionComponents'
import {
  taskAction, taskStateText, type StateTone, type TaskAction, type TaskGroups, type ToolTask,
} from './taskGroups'
import { PriorityDot, TASK_BUTTON, TASK_BUTTON_PRIMARY, TaskGroupHeading } from './TasksToolParts'

export interface TasksListProps {
  groups: TaskGroups
  now: Date
  /** Your tasks adds the project beside each task. */
  showProject?: boolean
  onOpen: (task: ToolTask) => void
  onAction: (task: ToolTask, action: Exclude<TaskAction, 'assign'>) => void
  /** Assign opens the agent picker in the row's place. */
  renderAssign: (task: ToolTask) => ReactNode
  /** Whether the person may act on this task; false (a project Viewer) leaves its row with no action. Default: yes. */
  mayAct?: (task: ToolTask) => boolean
  emptyText?: string
}

const TONE: Record<StateTone, string> = { needs: 'text-warning', live: 'text-success', muted: 'text-text-muted' }
const UP_NEXT_SHOWN = 8

// One row, two layouts: two lines in a narrow tool, a table row once the tool is wide.
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'title_action'_'meta_meta'] items-center gap-x-3 gap-y-0.5 px-4 py-2.5"
const WIDE = "@2xl:grid-cols-[minmax(12rem,3fr)_minmax(0,1.5fr)_minmax(0,1fr)_6.5rem] @2xl:[grid-template-areas:'title_meta_board_action'] @2xl:gap-y-0"
const WIDE_PROJECT = "@2xl:grid-cols-[minmax(12rem,3fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_6.5rem] @2xl:[grid-template-areas:'title_project_meta_board_action'] @2xl:gap-y-0"

const ACTION_LABEL: Record<TaskAction, string> = { review: 'Review', assign: 'Assign', runAgain: 'Run again' }

function boardText(t: ToolTask): string | null {
  if (!t.board) return null
  return [t.board.name, t.columnLabel].filter(Boolean).join(' · ')
}

function TaskRow({ task, now, group, props }: { task: ToolTask; now: Date; group: keyof TaskGroups; props: TasksListProps }) {
  const state = taskStateText(task, now)
  const action = props.mayAct && !props.mayAct(task) ? null : taskAction(task)
  const board = boardText(task)
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => props.onOpen(task)}
        onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) props.onOpen(task) }}
        className={`${ROW_GRID} ${props.showProject ? WIDE_PROJECT : WIDE} cursor-pointer hover:bg-surface-hover`}
      >
        <div className="flex min-w-0 items-center gap-2 [grid-area:title]">
          <PriorityDot priority={task.priority} className="hidden @2xl:inline-block" />
          <span className="shrink-0 font-mono text-micro text-text-muted">{task.key}</span>
          <span className="truncate text-body text-text-primary">{task.title}</span>
        </div>
        {props.showProject && (
          <span className="hidden truncate text-small text-text-secondary [grid-area:project] @2xl:block">{task.project?.name}</span>
        )}
        <div className="flex min-w-0 items-center gap-1.5 text-small [grid-area:meta]">
          {task.agent && <AgentAvatar name={task.agent.name} size="sm" />}
          <span className={`truncate ${TONE[state.tone]}`}>{state.text}</span>
          {group === 'upNext' && board && <span className="truncate text-text-muted @2xl:hidden">· {board}</span>}
        </div>
        <span className="hidden truncate text-small text-text-muted [grid-area:board] @2xl:block">{board ?? 'Backlog'}</span>
        <div className="justify-self-end [grid-area:action]" onClick={e => e.stopPropagation()}>
          {action === 'assign' ? props.renderAssign(task) : action ? (
            <button
              type="button"
              className={action === 'review' ? TASK_BUTTON_PRIMARY : TASK_BUTTON}
              onClick={() => props.onAction(task, action)}
            >
              {ACTION_LABEL[action]}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function Group({ title, tasks, group, props, limit }: { title: string; tasks: ToolTask[]; group: keyof TaskGroups; props: TasksListProps; limit?: number }) {
  const [all, setAll] = useState(false)
  if (tasks.length === 0) return null
  const shown = limit && !all ? tasks.slice(0, limit) : tasks
  return (
    <section>
      <div className="px-4 pb-1 pt-3"><TaskGroupHeading count={tasks.length}>{title}</TaskGroupHeading></div>
      <ul className="divide-y divide-border-subtle">
        {shown.map(t => <TaskRow key={t.id} task={t} now={props.now} group={group} props={props} />)}
      </ul>
      {shown.length < tasks.length && (
        <button type="button" onClick={() => setAll(true)} className="px-4 py-2 text-small text-accent hover:underline">
          {tasks.length - shown.length} more
        </button>
      )}
    </section>
  )
}

/** The Tasks tool's one list in three groups (every screen reviewed spec §3). */
export function TasksList(props: TasksListProps) {
  const { groups } = props
  const empty = groups.needsYou.length + groups.workingOn.length + groups.upNext.length === 0
  return (
    <div className="@container">
      <div
        className={`hidden gap-x-3 border-b border-border-subtle px-4 py-1.5 text-micro font-medium uppercase tracking-wide text-text-muted @2xl:grid ${
          props.showProject
            ? '@2xl:grid-cols-[minmax(12rem,3fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_6.5rem]'
            : '@2xl:grid-cols-[minmax(12rem,3fr)_minmax(0,1.5fr)_minmax(0,1fr)_6.5rem]'
        }`}
      >
        <span>Task</span>
        {props.showProject && <span>Project</span>}
        <span>Agent · state</span>
        <span>Board · column</span>
        <span />
      </div>
      {empty && <p className="px-4 py-6 text-small text-text-muted">{props.emptyText ?? 'Nothing needs you, nothing is running, and nothing is waiting on a board.'}</p>}
      <Group title="Needs you" tasks={groups.needsYou} group="needsYou" props={props} />
      <Group title="Working on" tasks={groups.workingOn} group="workingOn" props={props} />
      <Group title="Up next" tasks={groups.upNext} group="upNext" props={props} limit={UP_NEXT_SHOWN} />
    </div>
  )
}
