import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useAction, getMyTaskList, runTask } from 'wasp/client/operations'
import {
  TasksList, TasksListHeading, TasksScorecards, TasksToolHeader, taskCountsLine, scorecardsOf, shownCount, NO_COUNTS, type TaskListCard, type TaskListPageData, type TaskListRowData,
} from '@agenthix/ui/tasks'
import { Button, EmptyState } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { AssignInRow } from './AssignInRow'
import { NO_OPTIONS } from './ProjectTaskList'
import { useNow } from './useNow'
import { useListReadFailure } from './useListReadFailure'
import { useTaskList } from './useTaskList'
import { useAttention } from '../../shared/components/AttentionDialog'
import { useMayWorkWhere, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'

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
  const { data, isLoading, error, refetch } = useQuery(getMyTaskList, list.args, { refetchInterval: REFRESH_MS })
  const page: TaskListPageData | undefined = data
  const runFn = useAction(runTask)
  const mayWork = useMayWorkWhere()
  const attention = useAttention()
  const readFailed = useListReadFailure(error, () => void refetch(), attention.show)
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
    >
      {/* One left edge with the breadcrumb: the screen bar's 24 px, the list's own 16 px inside this 8 px. */}
      <div className="w-full pb-8 lg:px-2">
        {/* Below lg the top bar is titled Your tasks: the heading keeps only its counts there. */}
        <TasksListHeading
          title="Your tasks" level={1} compact
          counts={page ? taskCountsLine(page.counts, 'mine', narrowed && page.total !== undefined ? { shown: shownCount(page.counts, list.card), total: page.total } : null) : null}
        />
        <TasksScorecards cards={scorecardsOf(page?.counts ?? NO_COUNTS, 'mine')} chosen={list.card} onChoose={list.chooseCard} loading={!page} failed={readFailed && !page} matching={Object.keys(list.filters).length > 0 || !!list.args.search} />
        <TasksToolHeader
          kind="mine" search={list.search} onSearch={list.setSearch} filters={list.filters} onFilters={list.setFilters}
          options={page?.options ?? NO_OPTIONS} sort={list.sort} onSort={list.setSort}
        />
        {readFailed && !page ? (
          <div className="px-4 pt-4"><EmptyState variant="inline" title="The tasks could not be read." action={<Button variant="secondary" onClick={() => void refetch()}>Try again</Button>} /></div>
        ) : isLoading || !page ? (
          <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
        ) : (
          <div className="pt-4">
            <TasksList
              rows={page.rows} kind="mine" now={now} hasMore={page.hasMore} onShowMore={list.showMore}
              emptyText={narrowed ? 'No task matches your search and filters.' : 'Nothing needs you or runs on your behalf right now.'}
              emptyAction={narrowed ? <Button variant="secondary" onClick={() => { list.setSearch(''); list.setFilters({}); list.chooseCard(null) }}>Clear search and filters</Button> : undefined}
              cannotActReason={VIEWER_CANNOT_WORK}
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
