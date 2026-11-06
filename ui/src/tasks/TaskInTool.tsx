import { useState, type ReactNode } from 'react'
import { TasksViewHeader } from './TasksToolParts'

export interface TaskInToolProps {
  /** Absent on a task's own page, whose way back is the screen bar's breadcrumb. */
  onBack?: () => void
  backLabel?: string
  /** The header's title: a task's page has no "‹ Tasks" to carry its key. */
  headerTitle?: string
  /** Kept in view: the key, state, column and agent; Talk about this task, the one button for the state, ⋯. */
  header: ReactNode
  title: ReactNode
  description: ReactNode
  /** One block for the state the task is in; an epic's progress. */
  now: ReactNode
  /** Comments, Runs and Activity; an epic's Tasks first. */
  tabs: ReactNode
  /** Who, Where, When and About. */
  details: ReactNode
  /** The folded Details' one line on a narrow screen: "Writer · High · 6 Apr". */
  detailsSummary?: string
}

/**
 * A task's page (T0), in five parts always in the same places: the header, kept in view; the title and description;
 * Now; the tabs; and the Details beside them. Narrow, it is one column, the Details folded into one line before the tabs.
 */
export function TaskInTool(p: TaskInToolProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  return (
    <div className="@container">
      {p.onBack && <TasksViewHeader back={p.backLabel ?? 'Tasks'} onBack={p.onBack} title={p.headerTitle} />}
      {p.header}
      <div className="grid gap-x-6 gap-y-5 px-4 py-4 @2xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-4 @2xl:col-start-1 @2xl:row-start-1">
          <div className="space-y-1">
            {p.title}
            {p.description}
          </div>
          {p.now}
        </div>
        <aside aria-label="Details" className="space-y-4 border-border-subtle @2xl:col-start-2 @2xl:row-span-2 @2xl:row-start-1 @2xl:border-l @2xl:pl-4">
          <button
            type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(v => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-left text-small text-text-secondary @2xl:hidden"
          >
            <span className="font-medium text-text-primary">Details</span>
            {p.detailsSummary && <span className="min-w-0 truncate">· {p.detailsSummary}</span>}
            <span aria-hidden className="ml-auto">{detailsOpen ? '▴' : '▾'}</span>
          </button>
          <div className={`space-y-4 ${detailsOpen ? '' : 'hidden'} @2xl:block`}>{p.details}</div>
        </aside>
        <div className="min-w-0 @2xl:col-start-1 @2xl:row-start-2">{p.tabs}</div>
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
