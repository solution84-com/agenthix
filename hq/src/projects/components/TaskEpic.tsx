import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useQuery, useAction, getTaskList, runTask } from 'wasp/client/operations'
import { EmptyState } from '@agenthix/ui/primitives'
import { ProgressRing, TasksList, type TaskListPageData, type TaskListRowData } from '@agenthix/ui/tasks'
import { AssignInRow } from '../pages/AssignInRow'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { useAttention } from '../../shared/components/AttentionDialog'
import { daysLeftText, dayText, epicActivityText, type EpicChild, type EpicProgress } from './taskPageState'

/** One of an epic's tasks, as its progress counts them. */
export type EpicTaskRow = EpicChild & { key: string; title: string; columnLabel: string; agentName: string | null }

/** An epic's open tasks are rarely more than this; the rest are a click away in the project's Tasks. */
const EPIC_TASKS_LIMIT = 200

/** Where a task has its Now block, an epic has its progress (T10): the ring, what is done, what is happening, its milestone. */
export function EpicProgressBlock({ progress, milestone, now }: { progress: EpicProgress; milestone: { name: string; date: string | Date } | null; now: Date }) {
  const happening = epicActivityText(progress)
  return (
    <section aria-label="Progress" className="flex flex-wrap items-center gap-4 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3">
      <ProgressRing done={progress.done} total={progress.total} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-text-primary">
          {progress.total ? `${progress.done} of ${progress.total} done` : 'No tasks in it yet'}
        </p>
        {happening && <p className="text-small text-text-secondary">{happening}</p>}
      </div>
      {milestone && (
        <div className="text-right">
          <p className="text-small text-text-primary">{milestone.name} · {dayText(milestone.date)}</p>
          <p className="text-small text-text-muted">{daysLeftText(milestone.date, now)}</p>
        </div>
      )}
    </section>
  )
}

/**
 * An epic's Tasks tab (T10): its open tasks by importance, drawn by the task lists' own row, and its done ones folded.
 * Adding a task is the header's button.
 */
export function EpicTasks({ epicId, projectId, now }: { epicId: string; projectId: string; now: Date }) {
  const navigate = useNavigate()
  const canChange = useMayWork(projectId)
  const [showDone, setShowDone] = useState(false)
  const runFn = useAction(runTask)
  const attention = useAttention()
  const { data, isLoading } = useQuery(getTaskList, { projectId, epicId, sort: 'importance', limit: EPIC_TASKS_LIMIT })
  const page: TaskListPageData | undefined = data
  if (isLoading || !page) return <p className="text-small text-text-muted">Loading…</p>
  const open = page.rows.filter(r => r.status !== 'DONE')
  const done = page.rows.filter(r => r.status === 'DONE')
  if (open.length === 0 && done.length === 0) return <EmptyState variant="inline" title="No tasks are filed under this epic yet." />

  const runAgain = (row: TaskListRowData) => {
    runFn({ taskId: row.id }).catch(e => attention.show({
      text: e instanceof Error && e.message ? e.message : `${row.key} did not start. Nothing was changed.`,
      retry: () => runAgain(row),
    }))
  }
  const list = (rows: TaskListRowData[], emptyText: string) => (
    <div className="-mx-4">
      <TasksList
        rows={rows} kind="project" now={now} emptyText={emptyText} underEpic
        onOpen={row => navigate(`/tasks/${row.key}`)}
        onNextStep={(row, step) => (step === 'runAgain' ? runAgain(row) : navigate(`/tasks/${row.key}?at=waiting`))}
        renderAssign={row => <AssignInRow taskId={row.id} projectId={projectId} onError={text => attention.show({ text })} />}
        mayAct={() => canChange} cannotActReason={VIEWER_CANNOT_WORK}
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
      {attention.dialog}
    </div>
  )
}
