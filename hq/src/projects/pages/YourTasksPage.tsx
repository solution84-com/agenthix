import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useAction, getMyTasks, runTask } from 'wasp/client/operations'
import {
  TasksList, TasksToolHeader, TasksSearch, DoneList,
  groupTasks, doneRecently, filterTasks, NO_TASK_FILTER, type TaskListFilter, type ToolTask,
} from '@agenthix/ui/tasks'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { AssignInRow } from './AssignInRow'
import { toToolTask, type TaskRowData } from './toolTaskRows'
import { useNow } from './useNow'
import { useMayWorkWhere } from '../../shared/hooks/useMayWork'

const REFRESH_MS = 15_000

/**
 * Your tasks (every screen reviewed spec §3), the Tasks screen in the navigation: the tasks done on
 * the person's behalf in every project, in the same groups as a project's Tasks tool, with a project
 * filter and Done beside search. A task opens in its project, with the Tasks tool and the task open.
 */
export function YourTasksPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery(getMyTasks, undefined, { refetchInterval: REFRESH_MS })
  const runFn = useAction(runTask)
  const mayWork = useMayWorkWhere()
  const now = useNow()
  const [filter, setFilter] = useState<TaskListFilter>(NO_TASK_FILTER)
  const [params, setParams] = useSearchParams()
  const showDone = params.get('view') === 'done'
  const [notice, setNotice] = useState('')

  const tasks = useMemo(
    () => ((data ?? []) as (TaskRowData & { project: { id: string; key: string; name: string } })[]).map(r => toToolTask(r, r.project)),
    [data],
  )
  const projects = useMemo(() => {
    const byKey = new Map(tasks.flatMap(t => (t.project ? [[t.project.key, t.project.name] as const] : [])))
    return [...byKey].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks])
  const done = useMemo(() => doneRecently(tasks, now), [tasks, now])
  const groups = useMemo(() => groupTasks(filterTasks(tasks, filter)), [tasks, filter])
  const open = (t: ToolTask) => navigate(`/tasks/${t.key}`)

  return (
    <AppLayout
      breadcrumbs={showDone ? [{ label: 'Tasks', href: '/tasks' }, { label: 'Done' }] : [{ label: 'Tasks' }]}
      title={showDone ? 'Done' : 'Your tasks'}
      subtitle={showDone ? 'Finished in the last 30 days, in every project' : 'Done on your behalf, in every project'}
    >
      <div className="mx-auto w-full max-w-5xl pb-8">
        {showDone ? (
          <>
            <div className="flex px-4 pt-3"><TasksSearch label="Search done tasks" value={filter.search} onChange={search => setFilter({ ...filter, search })} /></div>
            <DoneList tasks={filterTasks(done, { ...NO_TASK_FILTER, search: filter.search })} onOpen={open} showProject />
          </>
        ) : (
          <>
            <TasksToolHeader
              doneCount={done.length} filter={filter} onFilter={setFilter} projects={projects} showPriorityFilter={false}
              onOpenDone={() => setParams({ view: 'done' })}
            />
            {notice && <p role="status" className="px-4 pt-2 text-small text-text-secondary">{notice}</p>}
            {isLoading ? (
              <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
            ) : (
              <TasksList
                groups={groups} now={now} showProject onOpen={open}
                emptyText="Nothing is done on your behalf right now."
                onAction={(t, action) => {
                  if (action === 'review') navigate(`/tasks/${t.key}?at=waiting`)
                  else void runFn({ taskId: t.id }).catch(e => setNotice(e instanceof Error ? e.message : 'That did not work'))
                }}
                renderAssign={t => <AssignInRow taskId={t.id} projectId={t.project!.id} onError={setNotice} />}
                mayAct={t => mayWork(t.project?.id)}
              />
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
