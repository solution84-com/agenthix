import { useNavigate } from 'react-router'
import { useQuery, useAction, getTaskList, runTask } from 'wasp/client/operations'
import { Button, EmptyState } from '@agenthix/ui/primitives'
import {
  TasksList, TasksScorecards, TasksToolHeader, TasksViewHeader, scorecardsOf,
  type TaskListCard, type TaskListPageData, type TaskListRowData,
} from '@agenthix/ui/tasks'
import { AssignInRow } from './AssignInRow'
import { emptyTasksState } from './emptyTasksState'
import { useNow } from './useNow'
import { useTaskList } from './useTaskList'
import { useAttention } from '../../shared/components/AttentionDialog'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'

/** How often the list reads its tasks again, so a run's progress shows while the person keeps talking. */
const TASKS_REFRESH_MS = 15_000

/**
 * A project's Tasks (T7): the scorecards, search, filters and order, then one flat list; New task at the top right.
 * A row opens its task (or its epic) in the tool.
 */
export function ProjectTaskList({ project, initialCard, onOpen }: {
  project: { id: string; key: string }
  initialCard: TaskListCard | null
  onOpen: (taskKey: string, atWaiting?: boolean) => void
}) {
  const navigate = useNavigate()
  const list = useTaskList(`project:${project.id}`, initialCard)
  const { data, isLoading } = useQuery(getTaskList, { projectId: project.id, ...list.args }, { refetchInterval: TASKS_REFRESH_MS })
  const page: TaskListPageData | undefined = data
  const runFn = useAction(runTask)
  const canStart = useMayWork(project.id)
  const attention = useAttention()
  const now = useNow()

  const narrowed = list.card !== null || Object.keys(list.filters).length > 0 || !!list.args.search
  const empty = emptyTasksState({ loaded: !isLoading, taskCount: page?.rows.length ?? 0, narrowed, canStart })
  const newTask = () => navigate(`/projects/${project.key}/tasks/new`)
  const runAgain = (row: TaskListRowData) => {
    runFn({ taskId: row.id }).catch(e => attention.show({
      text: e instanceof Error && e.message ? e.message : `${row.key} did not start. Nothing was changed.`,
      retry: () => runAgain(row),
    }))
  }

  return (
    <div className="pb-6">
      <TasksViewHeader
        title="Tasks"
        action={canStart ? <Button size="sm" onClick={newTask}>New task</Button> : undefined}
      />
      {!canStart && <p className="px-4 pt-2 text-small text-text-muted">{VIEWER_CANNOT_WORK}</p>}
      {page && <TasksScorecards cards={scorecardsOf(page.counts, 'project')} chosen={list.card} onChoose={list.chooseCard} />}
      <TasksToolHeader
        kind="project" search={list.search} onSearch={list.setSearch} filters={list.filters} onFilters={list.setFilters}
        options={page?.options ?? NO_OPTIONS} sort={list.sort} onSort={list.setSort}
      />
      {isLoading || !page ? (
        <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
      ) : empty.newTask ? (
        <div className="px-4 pt-4">
          <EmptyState variant="inline" title={empty.text ?? ''} action={<Button variant="secondary" size="sm" onClick={newTask}>New task</Button>} />
        </div>
      ) : (
        <div className="pt-2">
          <TasksList
            rows={page.rows} kind="project" now={now} emptyText={empty.text ?? 'No task matches.'}
            hasMore={page.hasMore} onShowMore={list.showMore}
            onOpen={row => onOpen(row.key)}
            onNextStep={(row, step) => (step === 'runAgain' ? runAgain(row) : onOpen(row.key, true))}
            renderAssign={row => <AssignInRow taskId={row.id} projectId={project.id} onError={text => attention.show({ text })} />}
            mayAct={() => canStart}
          />
        </div>
      )}
      {attention.dialog}
    </div>
  )
}

export const NO_OPTIONS: TaskListPageData['options'] = { agents: [], boards: [], epics: [], queuedBy: [], waitingOn: [], projects: [] }
