import type { ReactNode } from 'react'
import { TasksViewHeader } from './TasksToolParts'

export interface TaskInToolProps {
  /** Absent on a task's own page, whose way back is the screen bar's breadcrumb. */
  onBack?: () => void
  backLabel?: string
  /** The header's title: a task's page has no "‹ Tasks" to carry its key. */
  headerTitle?: string
  /** "WEB-27 · Sprint 3 · In progress". */
  keyLine: string
  title: ReactNode
  description: ReactNode
  /** Notices about the task's run: held, waiting, failed. */
  notices?: ReactNode
  /** What waits in the task's session, answered in place, with Open session. */
  waiting: ReactNode
  comments: ReactNode
  /** Agent, board and column, priority, on whose behalf, start time, files, who created it. */
  facts: ReactNode
  /** The one action for the state the task is in. */
  action: ReactNode
  menu: ReactNode
}

/**
 * One task inside the Tasks tool (every screen reviewed spec §3): its key,
 * board and column, title and description; what waits in its session; its
 * comments in full. The facts sit beside when the tool is wide, below when narrow.
 */
export function TaskInTool(p: TaskInToolProps) {
  return (
    <div className="@container">
      <TasksViewHeader back={p.backLabel ?? 'Tasks'} onBack={p.onBack} title={p.headerTitle} action={<>{p.action}{p.menu}</>} />
      <div className="grid gap-6 px-4 py-4 @2xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-5">
          <div className="space-y-1">
            <p className="text-small text-text-muted">{p.keyLine}</p>
            {p.title}
            {p.description}
          </div>
          {p.notices}
          {p.waiting}
          {p.comments}
        </div>
        <aside aria-label="Task facts" className="space-y-4 border-border-subtle @2xl:border-l @2xl:pl-4">{p.facts}</aside>
      </div>
    </div>
  )
}

/** One fact: a small label over its value. */
export function TaskFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-micro font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <div className="text-small text-text-primary">{children}</div>
    </div>
  )
}
