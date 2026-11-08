import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useQuery, getTaskList } from 'wasp/client/operations'
import { EmptyState } from '@agenthix/ui/primitives'
import { ProgressRing, TasksList, type TaskListPageData, type TaskListRowData } from '@agenthix/ui/tasks'
import { epicDueText, epicStateText, type EpicChild, type EpicProgress } from './taskPageState'

/** One of an epic's tasks, as its progress counts them. */
export type EpicTaskRow = EpicChild & { key: string; title: string }

/** An epic's open tasks are rarely more than this; the rest are a click away in the project's Tasks. */
const EPIC_TASKS_LIMIT = 200

/**
 * Where a task has its Now block, an epic has its progress (T5): the ring, what is done of all, then what is in
 * progress and to do, and when it is due. No run counts: each task's run shows on its agent's avatar (D18).
 */
export function EpicProgressBlock({ progress, due, now }: { progress: EpicProgress; due: string | Date | null; now: Date }) {
  const line = [epicStateText(progress), due ? epicDueText(due, now) : null].filter(Boolean).join(' · ')
  return (
    <section aria-label="Progress" className="flex items-center gap-4 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3">
      <ProgressRing done={progress.done} total={progress.total} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-text-primary">
          {progress.total ? `${progress.done} of ${progress.total} done` : 'No tasks in it yet'}
        </p>
        {line && <p className="text-small text-text-muted">{line}</p>}
      </div>
    </section>
  )
}

/**
 * An epic's Tasks tab (T10): its open tasks in rank order, drawn by the task lists' own row, and its done ones folded.
 * Adding a task is the header's button.
 */
export function EpicTasks({ epicId, projectId, now }: { epicId: string; projectId: string; now: Date }) {
  const navigate = useNavigate()
  const [showDone, setShowDone] = useState(false)
  const { data, isLoading } = useQuery(getTaskList, { projectId, epicId, sort: 'rank', limit: EPIC_TASKS_LIMIT })
  const page: TaskListPageData | undefined = data
  if (isLoading || !page) return <p className="text-small text-text-muted">Loading…</p>
  const open = page.rows.filter(r => r.state !== 'DONE')
  const done = page.rows.filter(r => r.state === 'DONE')
  if (open.length === 0 && done.length === 0) return <EmptyState variant="inline" title="No tasks are filed under this epic yet." />

  const list = (rows: TaskListRowData[], emptyText: string) => (
    <div className="-mx-4">
      <TasksList
        rows={rows} kind="project" now={now} emptyText={emptyText} underEpic
        onOpen={row => navigate(`/tasks/${row.key}`)}
        onOpenRun={row => navigate(`/tasks/${row.key}/session`)}
      />
    </div>
  )
  return (
    <div className="space-y-3">
      {list(open, 'Every task in this epic is done.')}
      {done.length > 0 && (
        <div className="space-y-2">
          <button
            type="button" aria-expanded={showDone} onClick={() => setShowDone(v => !v)}
            className="inline-flex items-center gap-1 rounded text-small text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronRight size={14} aria-hidden className={`transition-transform ${showDone ? 'rotate-90' : ''}`} />
            {showDone ? `Hide ${done.length} done` : `Show ${done.length} done`}
          </button>
          {showDone && list(done, '')}
        </div>
      )}
    </div>
  )
}
