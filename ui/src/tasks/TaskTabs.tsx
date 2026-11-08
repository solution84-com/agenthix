import { useState, type ReactNode } from 'react'

export type TaskTab = 'tasks' | 'comments' | 'runs' | 'activity'

export interface TaskTabsProps {
  /** The task's runs as the page had them (TaskInTool's `waiting`): the Runs tab's content when `runs` is not given. */
  session: ReactNode
  /** The task's comments: the Comments tab. */
  comments: ReactNode
  /** The Runs tab: the task's runs as a timeline. */
  runs?: ReactNode
  /** The Activity tab: the task's log. Left out, there is no Activity tab. */
  activity?: ReactNode
  /** An epic's page (T10): its Tasks tab, first; an epic is never run, so it has no Runs tab. */
  tasks?: { count?: number; content: ReactNode }
  /** No Runs tab: an epic is never run. */
  noRuns?: boolean
  commentCount?: number
  runCount?: number
  /** The open tab, when the caller keeps it (in the address); otherwise the tabs keep it. */
  tab?: TaskTab
  onTabChange?: (tab: TaskTab) => void
}

const LABEL: Record<TaskTab, string> = { tasks: 'Tasks', comments: 'Comments', runs: 'Runs', activity: 'Activity' }

/**
 * A task's page below its *Now* (T0): three tabs, *Activity* (everything that happened to it, one line each; open
 * first), *Comments* (the task's record, threaded; every run reads them) and *Runs* (the work, run by run). An epic's
 * page has *Tasks*, *Comments* and *Activity*, Tasks open first.
 */
export function TaskTabs({ session, comments, runs, activity, tasks, noRuns, commentCount, runCount, tab, onTabChange }: TaskTabsProps) {
  const hasActivity = activity !== undefined
  const shown: TaskTab[] = tasks
    ? ['tasks', 'comments', ...(hasActivity ? ['activity' as const] : [])]
    : [...(hasActivity ? ['activity' as const] : []), 'comments', ...(noRuns ? [] : ['runs' as const])]
  const [own, setOwn] = useState<TaskTab>(shown[0])
  const wanted = tab ?? own
  const open = shown.includes(wanted) ? wanted : shown[0]
  const choose = (t: TaskTab) => {
    setOwn(t)
    onTabChange?.(t)
  }
  const count: Partial<Record<TaskTab, number | undefined>> = { tasks: tasks?.count, comments: commentCount, runs: runCount }
  const content: Record<TaskTab, ReactNode> = { tasks: tasks?.content, comments, runs: runs ?? session, activity }

  return (
    <section aria-label="The task's record" className="space-y-3">
      <div role="tablist" aria-label="Activity, comments and runs" className="flex gap-1 border-b border-border-subtle">
        {shown.map(t => (
          <button
            key={t} type="button" role="tab" id={`task-tab-${t}`} aria-selected={open === t} aria-controls={`task-tabpanel-${t}`}
            onClick={() => choose(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-small max-lg:min-h-11 ${open === t ? 'border-accent font-semibold text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'}`}
          >
            {LABEL[t]}
            {count[t] ? <span className="ml-1.5 text-micro text-text-muted">{count[t]}</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`task-tabpanel-${open}`} aria-labelledby={`task-tab-${open}`}>
        {content[open]}
      </div>
    </section>
  )
}
