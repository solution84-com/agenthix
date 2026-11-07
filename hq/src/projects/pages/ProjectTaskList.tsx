import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import { useQuery, useAction, getTaskList, runTask } from 'wasp/client/operations'
import { Button, EmptyState } from '@agenthix/ui/primitives'
import {
  TasksList, TasksListHeading, TasksScorecards, TasksToolHeader, taskCountsLine, scorecardsOf, shownCount, NO_COUNTS,
  type TaskListCard, type TaskListPageData, type TaskListRowData,
} from '@agenthix/ui/tasks'
import { AssignInRow } from './AssignInRow'
import { emptyTasksState } from './emptyTasksState'
import { useNow } from './useNow'
import { useListReadFailure } from './useListReadFailure'
import { useTaskList } from './useTaskList'
import { useAttention } from '../../shared/components/AttentionDialog'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { usePlaceTopBarAdd } from '../../places/placeCrumb'

/** How often the list reads its tasks again, so a run's progress shows while the person keeps talking. */
const TASKS_REFRESH_MS = 15_000

/**
 * A project's Tasks (T7): the heading with its counts and New task, the scorecards, search, filters and order, then
 * one flat list. A row opens its task (or its epic) in the tool. Below `lg` the top bar names the view and holds New
 * task, so the heading shows only its counts. A Viewer sees New task and each Run again greyed, with why.
 */
export function ProjectTaskList({ project, initialCard, onOpen }: {
  project: { id: string; key: string }
  initialCard: TaskListCard | null
  onOpen: (taskKey: string, atWaiting?: boolean) => void
}) {
  const navigate = useNavigate()
  const list = useTaskList(`project:${project.id}`, initialCard)
  const { data, isLoading, error, refetch } = useQuery(getTaskList, { projectId: project.id, ...list.args }, { refetchInterval: TASKS_REFRESH_MS })
  const page: TaskListPageData | undefined = data
  const runFn = useAction(runTask)
  const canStart = useMayWork(project.id)
  const attention = useAttention()
  const readFailed = useListReadFailure(error, () => void refetch(), attention.show)
  const now = useNow()
  const newTask = () => navigate(`/projects/${project.key}/tasks/new`)
  const inTopBar = usePlaceTopBarAdd(canStart ? { label: 'New task', onClick: newTask } : null)

  const narrowed = list.card !== null || Object.keys(list.filters).length > 0 || !!list.args.search
  const empty = emptyTasksState({ loaded: !isLoading, taskCount: page?.rows.length ?? 0, narrowed, canStart })
  const clear = () => { list.setSearch(''); list.setFilters({}); list.chooseCard(null) }
  const runAgain = (row: TaskListRowData) => {
    runFn({ taskId: row.id }).catch(e => attention.show({
      text: e instanceof Error && e.message ? e.message : `${row.key} did not start. Nothing was changed.`,
      retry: () => runAgain(row),
    }))
  }
  const newTaskButton = (
    <Button leadingIcon={<Plus size={14} aria-hidden />} onClick={newTask} disabled={!canStart} title={canStart ? undefined : VIEWER_CANNOT_WORK}>
      New task
    </Button>
  )

  return (
    <div className="pb-6">
      <TasksListHeading
        title="Tasks"
        counts={page ? taskCountsLine(page.counts, 'project', narrowed && page.total !== undefined ? { shown: shownCount(page.counts, list.card), total: page.total } : null) : null}
        action={newTaskButton} compact={inTopBar}
      />
      <TasksScorecards cards={scorecardsOf(page?.counts ?? NO_COUNTS, 'project')} chosen={list.card} onChoose={list.chooseCard} loading={!page} failed={readFailed && !page} matching={Object.keys(list.filters).length > 0 || !!list.args.search} />
      <TasksToolHeader
        kind="project" search={list.search} onSearch={list.setSearch} filters={list.filters} onFilters={list.setFilters}
        options={page?.options ?? NO_OPTIONS} sort={list.sort} onSort={list.setSort}
      />
      {readFailed && !page ? (
        <div className="px-4 pt-4"><EmptyState variant="inline" title="The tasks could not be read." action={<Button variant="secondary" onClick={() => void refetch()}>Try again</Button>} /></div>
      ) : isLoading || !page ? (
        <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
      ) : empty.newTask ? (
        <div className="px-4 pt-4">
          <EmptyState
            variant="inline" title={empty.text ?? ''}
            action={<Button variant="secondary" leadingIcon={<Plus size={14} aria-hidden />} onClick={newTask}>New task</Button>}
          />
        </div>
      ) : (
        <div className="pt-4">
          <TasksList
            rows={page.rows} kind="project" now={now}
            emptyText={narrowed ? 'No task matches your search and filters.' : empty.text ?? 'No tasks yet.'}
            emptyAction={narrowed ? <Button variant="secondary" onClick={clear}>Clear search and filters</Button> : undefined}
            hasMore={page.hasMore} onShowMore={list.showMore}
            onOpen={row => onOpen(row.key)}
            onNextStep={(row, step) => (step === 'runAgain' ? runAgain(row) : onOpen(row.key, true))}
            renderAssign={row => <AssignInRow taskId={row.id} projectId={project.id} onError={text => attention.show({ text })} />}
            mayAct={() => canStart} cannotActReason={VIEWER_CANNOT_WORK}
          />
        </div>
      )}
      {attention.dialog}
    </div>
  )
}

export const NO_OPTIONS: TaskListPageData['options'] = { agents: [], boards: [], epics: [], queuedBy: [], waitingOn: [], projects: [] }
