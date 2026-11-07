import { TasksViewHeader } from './TasksToolParts'
import { TaskRunsTimeline, type TaskRunsTimelineProps } from './TaskRunsTimeline'

export interface TaskSessionViewProps extends TaskRunsTimelineProps {
  /** "‹ WEB-27": where back goes. Absent on a page whose breadcrumb is the way back. */
  backLabel?: string
  onBack?: () => void
  /** "WEB-27 · Frontend dev · 2 runs". */
  summary: string
}

/**
 * A task's runs on their own (the tools panel's and `/tasks/WEB-27/session`): the same timeline as the task page's
 * Runs tab, under a header. There is no box to type into a run (T0b): the task's conversation steers the work.
 */
export function TaskSessionView({ backLabel, onBack, summary, ...timeline }: TaskSessionViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TasksViewHeader back={backLabel} onBack={onBack} title="Runs" />
      <p className="px-4 pt-3 text-small text-text-muted">{summary}</p>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <TaskRunsTimeline {...timeline} />
      </div>
    </div>
  )
}
