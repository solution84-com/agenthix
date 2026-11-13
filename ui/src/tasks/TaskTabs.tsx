import { useState, type ReactNode } from 'react'
import { SegmentedControl } from '../primitives/SegmentedControl'

export type TaskTab = 'tasks' | 'comments' | 'runs' | 'activity' | 'files'

export interface TaskTabsProps {
  /** The task's runs as the page had them (TaskInTool's `waiting`): the Runs tab's content when `runs` is not given. */
  session: ReactNode
  /** The task's comments: the Comments tab. */
  comments: ReactNode
  /** The Runs tab: the task's runs as a timeline. */
  runs?: ReactNode
  /** The Activity tab: the task's log. Left out, there is no Activity tab. */
  activity?: ReactNode
  /** The Files tab: the files the task's runs wrote in its own folder. Left out, there is no Files tab. */
  files?: ReactNode
  /** An epic's page (T10): its Tasks tab, first; an epic is never run, so it has no Runs tab. */
  tasks?: { count?: number; content: ReactNode }
  /** No Runs tab: an epic is never run. */
  noRuns?: boolean
  commentCount?: number
  runCount?: number
  fileCount?: number
  /** The open tab, when the caller keeps it (in the address); otherwise the tabs keep it. */
  tab?: TaskTab
  onTabChange?: (tab: TaskTab) => void
}

const LABEL: Record<TaskTab, string> = { tasks: 'Tasks', comments: 'Comments', runs: 'Runs', activity: 'Activity', files: 'Files' }

/**
 * A task's page below its *Now* (T0): its tabs, *Activity* (everything that happened to it, one line each; open
 * first), *Comments* (the task's record, threaded; every run reads them), *Runs* (the work, run by run) and, when
 * given, *Files* (what its runs wrote in the task's own folder). An epic's
 * page has *Tasks*, *Comments* and *Activity*, Tasks open first.
 */
export function TaskTabs({ session, comments, runs, activity, files, tasks, noRuns, commentCount, runCount, fileCount, tab, onTabChange }: TaskTabsProps) {
  const hasActivity = activity !== undefined
  const shown: TaskTab[] = tasks
    ? ['tasks', 'comments', ...(hasActivity ? ['activity' as const] : [])]
    : [...(hasActivity ? ['activity' as const] : []), 'comments', ...(noRuns ? [] : ['runs' as const]), ...(files !== undefined ? ['files' as const] : [])]
  const [own, setOwn] = useState<TaskTab>(shown[0])
  const wanted = tab ?? own
  const open = shown.includes(wanted) ? wanted : shown[0]
  const choose = (t: TaskTab) => {
    setOwn(t)
    onTabChange?.(t)
  }
  const count: Partial<Record<TaskTab, number | undefined>> = { tasks: tasks?.count, comments: commentCount, runs: runCount, files: fileCount }
  const content: Record<TaskTab, ReactNode> = { tasks: tasks?.content, comments, runs: runs ?? session, activity, files }

  return (
    <section aria-label="The task's record" className="space-y-3">
      <SegmentedControl
        kind="tabs" label="Activity, comments and runs" value={open} onChange={choose}
        options={shown.map(t => ({ value: t, label: <>{LABEL[t]}{count[t] ? <span className="text-micro text-text-muted">{count[t]}</span> : null}</> }))}
      />
      <div role="tabpanel" aria-label={LABEL[open]}>
        {content[open]}
      </div>
    </section>
  )
}
