import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useAction, getMyTaskList, runTask } from 'wasp/client/operations'
import {
  TasksList, TasksScorecards, TasksToolHeader, scorecardsOf, type TaskListCard, type TaskListPageData, type TaskListRowData,
} from '@agenthix/ui/tasks'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { AssignInRow } from './AssignInRow'
import { NO_OPTIONS } from './ProjectTaskList'
import { useNow } from './useNow'
import { useTaskList } from './useTaskList'
import { useAttention } from '../../shared/components/AttentionDialog'
import { useMayWorkWhere } from '../../shared/hooks/useMayWork'

const REFRESH_MS = 15_000

const CARD_LABEL: Record<TaskListCard, string> = {
  needsYou: 'Needs you', running: 'Running', waiting: 'Waiting', notStarted: 'Not started', done: 'Done',
}

/** The scorecard the address names (`/tasks?view=done`), so a link or the breadcrumb opens that slice. */
function scorecardOf(view: string | null): TaskListCard | null {
  return view && view in CARD_LABEL && view !== 'notStarted' ? (view as TaskListCard) : null
}

/**
 * Your tasks (T7), the Tasks screen in the navigation: the tasks that need the person or run on their behalf, in
 * every project, as a project's list draws them with the project as each row's first chip. A task opens in its
 * project. The chosen scorecard is in the address: `/tasks?view=done`.
 */
export function YourTasksPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const card = scorecardOf(params.get('view'))
  const list = useTaskList('mine', null, [card, next => setParams(next ? { view: next } : {}, { replace: true })])
  const { data, isLoading } = useQuery(getMyTaskList, list.args, { refetchInterval: REFRESH_MS })
  const page: TaskListPageData | undefined = data
  const runFn = useAction(runTask)
  const mayWork = useMayWorkWhere()
  const attention = useAttention()
  const now = useNow()
  const narrowed = list.card !== null || Object.keys(list.filters).length > 0 || !!list.args.search

  const runAgain = (row: TaskListRowData) => {
    runFn({ taskId: row.id }).catch(e => attention.show({
      text: e instanceof Error && e.message ? e.message : `${row.key} did not start. Nothing was changed.`,
      retry: () => runAgain(row),
    }))
  }

  return (
    <AppLayout
      breadcrumbs={card ? [{ label: 'Your tasks', href: '/tasks' }, { label: CARD_LABEL[card] }] : [{ label: 'Your tasks' }]}
      title="Your tasks"
      subtitle="Tasks that need you or run on your behalf, in every project"
    >
      <div className="mx-auto w-full max-w-5xl pb-8">
        {page && <TasksScorecards cards={scorecardsOf(page.counts, 'mine')} chosen={list.card} onChoose={list.chooseCard} />}
        <TasksToolHeader
          kind="mine" search={list.search} onSearch={list.setSearch} filters={list.filters} onFilters={list.setFilters}
          options={page?.options ?? NO_OPTIONS} sort={list.sort} onSort={list.setSort}
        />
        {isLoading || !page ? (
          <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
        ) : (
          <div className="pt-2">
            <TasksList
              rows={page.rows} kind="mine" now={now} hasMore={page.hasMore} onShowMore={list.showMore}
              emptyText={narrowed ? 'No task matches.' : 'Nothing needs you or runs on your behalf right now.'}
              onOpen={row => navigate(`/tasks/${row.key}`)}
              onNextStep={(row, step) => (step === 'runAgain' ? runAgain(row) : navigate(`/tasks/${row.key}?at=waiting`))}
              renderAssign={row => <AssignInRow taskId={row.id} projectId={row.project.id} onError={text => attention.show({ text })} />}
              mayAct={row => mayWork(row.project.id)}
            />
          </div>
        )}
      </div>
      {attention.dialog}
    </AppLayout>
  )
}
