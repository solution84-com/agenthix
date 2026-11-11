import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import { useQuery, getMyTaskList } from 'wasp/client/operations'
import {
  TasksList, TasksListHeading, TasksScorecards, TasksToolHeader, filterChips, narrowedLine, orderedColumns, scorecardsOf,
  shownCount, NO_COUNTS, type TaskListCard, type TaskListPageData,
} from '@agenthix/ui/tasks'
import { Button, EmptyState } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { NO_OPTIONS } from './ProjectTaskList'
import { NewTaskInMenu } from './NewTaskInMenu'
import { useNow } from './useNow'
import { useTaskList } from './useTaskList'
import { useAttention } from '../../shared/components/AttentionDialog'
import { ReadFailure } from '@agenthix/ui/attention'

const REFRESH_MS = 15_000

const CARD_LABEL: Record<TaskListCard, string> = {
  backlog: 'Backlog', todo: 'To do', inProgress: 'In progress', done: 'Done', late: 'Late', noAgent: 'No agent',
}

/** The scorecard the address names (`/tasks?view=done`), so a link or the breadcrumb opens that slice. */
function scorecardOf(view: string | null): TaskListCard | null {
  return view && view in CARD_LABEL && view !== 'noAgent' ? (view as TaskListCard) : null
}

/**
 * Your tasks (Y1, D9): the person's planned work, the tasks whose *For* is them in every project they are in, by due
 * date with breaks by when. The same scorecards and line as a project's Tasks, with the project first; no run state
 * and no Needs you, which lives in Runs. New task asks which project first. A task opens in its project; a ringed
 * avatar opens its run. The chosen scorecard is in the address: `/tasks?view=done`.
 */
export function YourTasksPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const card = scorecardOf(params.get('view'))
  const list = useTaskList('mine', 'mine', null, [card, next => setParams(next ? { view: next } : {}, { replace: true })])
  const { data, isLoading, error, refetch } = useQuery(getMyTaskList, list.args, { refetchInterval: REFRESH_MS })
  const page: TaskListPageData | undefined = data
  const attention = useAttention()
  const readFailed = !!error
  const now = useNow()
  const [choosing, setChoosing] = useState(false)
  const options = page?.options ?? NO_OPTIONS
  const matching = filterChips(list.filters, 'mine', options).map(c => c.label).join(' · ')
  const newTaskIn = (projectKey: string) => { setChoosing(false); navigate(`/projects/${projectKey}/tasks/new`) }

  const newTask = (
    <div className="relative">
      <Button leadingIcon={<Plus size={14} aria-hidden />} aria-haspopup="menu" aria-expanded={choosing} onClick={() => setChoosing(v => !v)}>
        New task
      </Button>
      {choosing && <NewTaskInMenu onChoose={newTaskIn} onClose={() => setChoosing(false)} />}
    </div>
  )

  return (
    <AppLayout
      breadcrumbs={card ? [{ label: 'Your tasks', href: '/tasks' }, { label: CARD_LABEL[card] }] : [{ label: 'Your tasks' }]}
      phoneActions={[{ label: 'New task', hint: 'asks which project', onSelect: () => setChoosing(true) }]}
    >
      {/* One left edge with the breadcrumb: the screen bar's 24 px; 12 px on a phone. */}
      <div className="w-full pb-8">
        <TasksListHeading
          title="Your tasks" level={1} compact action={newTask}
          counts={page && list.narrowed && page.total !== undefined
            ? narrowedLine({ shown: shownCount(page.counts, list.card), total: page.total })
            : 'Tasks for you, in every project you’re in'}
        />
        {/* The phone's ⋯ opens the same menu, as a sheet. */}
        {choosing && <div className="lg:hidden"><NewTaskInMenu onChoose={newTaskIn} onClose={() => setChoosing(false)} /></div>}
        <TasksScorecards
          cards={scorecardsOf(page?.counts ?? NO_COUNTS, 'mine')} chosen={list.card} onChoose={list.chooseCard}
          loading={!page} failed={readFailed && !page} matching={Object.keys(list.filters).length > 0 || !!list.args.search}
        />
        <TasksToolHeader
          kind="mine" search={list.search} onSearch={list.setSearch} filters={list.filters} onFilters={list.setFilters}
          options={options} sort={list.sort} onSort={list.setSort} columns={list.columns} onColumns={list.setColumns}
        />
        {readFailed && !page ? (
          <ReadFailure what="The tasks" retry={() => void refetch()} />
        ) : isLoading || !page ? (
          <p className="px-6 py-6 max-lg:px-3 text-small text-text-muted">Loading tasks…</p>
        ) : page.total === 0 ? (
          <div className="px-6 pt-4 max-lg:px-3">
            <EmptyState variant="inline" title="Nothing planned for you" hint="Tasks for you in any project show here, by due date." />
          </div>
        ) : (
          <div className="pt-4">
            <TasksList
              rows={page.rows} kind="mine" now={now} hasMore={page.hasMore} onShowMore={list.showMore}
              columns={orderedColumns(list.columns, [])} dueGroups={list.sort === 'due'}
              emptyText={matching ? `No task matches ${matching}` : 'No task matches.'}
              emptyAction={list.narrowed ? <Button variant="secondary" onClick={list.clear}>Clear filters</Button> : undefined}
              onOpen={row => navigate(`/tasks/${row.key}`)}
              onOpenRun={row => navigate(`/tasks/${row.key}/session`)}
            />
          </div>
        )}
      </div>
      {attention.dialog}
    </AppLayout>
  )
}
