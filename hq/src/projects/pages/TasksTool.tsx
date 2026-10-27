import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import {
  useQuery, useAction, getTasks, getProjectByKey, getBoards, createTask, runTask,
} from 'wasp/client/operations'
import {
  TasksList, TasksToolHeader, TasksSearch, NewTaskRow, DoneList, TasksViewHeader,
  groupTasks, doneRecently, filterTasks, NO_TASK_FILTER, type TaskListFilter, type ToolTask,
} from '@agenthix/ui/tasks'
import { CreateTaskModal } from './CreateTaskModal'
import { AssignInRow } from './AssignInRow'
import { TaskInToolView } from './TaskInToolView'
import { TaskSessionPane } from './TaskSessionPane'
import { toToolTask } from './toolTaskRows'
import { useTasksToolUrl } from './useTasksToolUrl'
import { useNow } from './useNow'
import { useProjectAgents } from '../hooks/useProjectAgents'
import { ProjectBacklogView, useProjectTasksBoard } from '../boards/ProjectBacklogView'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'

/** How often the tool reads its tasks again, so a run's progress shows while the person keeps talking. */
const TASKS_REFRESH_MS = 15_000

interface Board { id: string; name: string; columns: { name: string; status: string; order: number }[] }

/**
 * The Tasks tool of a project or the personal space (every screen reviewed spec §3): one list in three groups,
 * with Backlog and Done as views of their own, and a task and its session opening inside the tool.
 * `projectKey` names the project where the address does not (Chat).
 */
export function TasksTool({ projectKey }: { projectKey?: string } = {}) {
  const params = useParams<{ key: string }>()
  const key = projectKey ?? params.key
  const { data: projectData } = useQuery(getProjectByKey, key ? { key } : undefined)
  const project = projectData
  const projectId = project?.id
  const live = { enabled: !!projectId, refetchInterval: TASKS_REFRESH_MS }
  const { data: rows, isLoading } = useQuery(getTasks, projectId ? { projectId } : undefined, live)
  const { data: boardsData } = useQuery(getBoards, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const agents = useProjectAgents(projectId)
  const createFn = useAction(createTask)
  const runFn = useAction(runTask)
  const canStart = useMayWork(projectId)
  const url = useTasksToolUrl()
  const now = useNow()

  const [filter, setFilter] = useState<TaskListFilter>(NO_TASK_FILTER)
  const [adding, setAdding] = useState(false)
  const [modalTitle, setModalTitle] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const tasks = useMemo(
    () => (project ? (rows ?? []).map(r => toToolTask(r, project)) : []),
    [rows, project],
  )
  const boards: Board[] = boardsData ?? []
  const { projectTasks } = useProjectTasksBoard(projectId)
  const backlogCount = projectTasks?.backlogCount ?? 0
  const done = useMemo(() => doneRecently(tasks, now), [tasks, now])
  const groups = useMemo(() => groupTasks(filterTasks(tasks, filter)), [tasks, filter])

  if (!project) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>

  const { screen } = url
  if (screen.kind === 'task') {
    return (
      <TaskInToolView
        key={screen.taskKey} taskKey={screen.taskKey} focusWaiting={screen.atWaiting}
        onBack={url.toList} onGone={url.toList} onOpenSession={() => url.toSession(screen.taskKey)}
        openFile={url.file} onOpenFile={file => url.toTaskFile(screen.taskKey, file)}
      />
    )
  }
  if (screen.kind === 'session') {
    return <TaskSessionPane key={screen.taskKey} taskKey={screen.taskKey} onBack={() => url.toTask(screen.taskKey)} />
  }

  const add = async (title: string) => {
    await createFn({ projectId: project.id, title })
    setNotice('Added to the backlog.')
  }
  const open = (t: ToolTask) => url.toTask(t.key)
  const newTaskFields = (
    <>
      {adding && (
        <NewTaskRow
          onAdd={add}
          onClose={() => setAdding(false)}
          onMoreDetails={title => { setAdding(false); setModalTitle(title) }}
        />
      )}
      {notice && <p role="status" className="px-4 pt-2 text-small text-text-secondary">{notice}</p>}
    </>
  )

  let body
  if (screen.kind === 'backlog') {
    body = (
      <>
        <div className="px-4 pt-4"><TasksViewHeader back="Tasks" onBack={url.toList} title="Backlog" /></div>
        {canStart && <NewTaskRow onAdd={add} onMoreDetails={setModalTitle} />}
        {notice && <p role="status" className="px-4 pt-2 text-small text-text-secondary">{notice}</p>}
        <div className="flex px-4 pt-3"><TasksSearch label="Search the backlog" value={filter.search} onChange={search => setFilter({ ...filter, search })} /></div>
        <ProjectBacklogView projectId={project.id} search={filter.search} onOpen={taskKey => url.toTask(taskKey)} />
      </>
    )
  } else if (screen.kind === 'done') {
    const shown = filterTasks(done, { ...NO_TASK_FILTER, search: filter.search })
    body = (
      <>
        <div className="px-4 pt-4"><TasksViewHeader back="Tasks" onBack={url.toList} title="Done" /></div>
        <div className="flex px-4 pt-3"><TasksSearch label="Search done tasks" value={filter.search} onChange={search => setFilter({ ...filter, search })} /></div>
        <DoneList tasks={shown} onOpen={open} />
      </>
    )
  } else {
    body = (
      <>
        <TasksToolHeader
          backlogCount={backlogCount} doneCount={done.length} filter={filter} onFilter={setFilter}
          agents={agents} boards={boards}
          onOpenBacklog={url.toBacklog} onOpenDone={url.toDone} onNewTask={canStart ? () => setAdding(true) : undefined}
        />
        {!canStart && <p className="px-4 pt-2 text-small text-text-muted">{VIEWER_CANNOT_WORK}</p>}
        {newTaskFields}
        {isLoading ? (
          <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
        ) : (
          <TasksList
            groups={groups} now={now} onOpen={open}
            onAction={(t, action) => {
              if (action === 'review') url.toTask(t.key, true)
              else void runFn({ taskId: t.id }).catch(e => setNotice(e instanceof Error ? e.message : 'That did not work'))
            }}
            renderAssign={t => <AssignInRow taskId={t.id} projectId={project.id} onError={setNotice} />}
            mayAct={() => canStart}
          />
        )}
      </>
    )
  }

  return (
    <div className="pb-6">
      {body}
      <CreateTaskModal
        open={modalTitle !== null} onClose={() => setModalTitle(null)} projectId={project.id}
        defaultTitle={modalTitle ?? ''} onCreated={() => setNotice('Added.')}
      />
    </div>
  )
}
