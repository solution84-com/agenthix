import { useParams } from 'react-router'
import { useQuery, getProjectByKey } from 'wasp/client/operations'
import { TaskInToolView } from './TaskInToolView'
import { TaskSessionPane } from './TaskSessionPane'
import { ProjectTaskList } from './ProjectTaskList'
import { useTasksToolUrl } from './useTasksToolUrl'
import { usePlaceCrumb } from '../../places/placeCrumb'

/**
 * The Tasks tool of a project or the personal space: the list (T1–T5), and a task and its session opening inside the
 * tool. `projectKey` names the project where the address does not (Chat). `?view=backlog` opens the list on its
 * Backlog card, the planning view (T4); `?view=done` on Done.
 */
export function TasksTool({ projectKey }: { projectKey?: string } = {}) {
  const params = useParams<{ key: string }>()
  const key = projectKey ?? params.key
  const { data: project } = useQuery(getProjectByKey, key ? { key } : undefined)
  const url = useTasksToolUrl()
  // An open task ends the place's breadcrumb, whose Tasks is then the way back; outside a place it keeps its back row.
  const inPlace = usePlaceCrumb(url.screen.kind === 'task' ? url.screen.taskKey : null)

  if (!project) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>

  const { screen } = url
  if (screen.kind === 'task') {
    return (
      <TaskInToolView
        key={screen.taskKey} taskKey={screen.taskKey} focusWaiting={screen.atWaiting}
        onBack={inPlace ? undefined : url.toList} onGone={url.toList} onOpenSession={() => url.toSession(screen.taskKey)}
        openFile={url.file} onOpenFile={file => url.toTaskFile(screen.taskKey, file)}
      />
    )
  }
  if (screen.kind === 'session') {
    return <TaskSessionPane key={screen.taskKey} taskKey={screen.taskKey} onBack={() => url.toTask(screen.taskKey)} />
  }
  return (
    <ProjectTaskList
      key={`${project.id}:${screen.kind}`}
      project={project}
      initialCard={screen.kind === 'done' ? 'done' : screen.kind === 'backlog' ? 'backlog' : null}
      onOpen={taskKey => url.toTask(taskKey)}
      onOpenRun={taskKey => url.toSession(taskKey)}
    />
  )
}
