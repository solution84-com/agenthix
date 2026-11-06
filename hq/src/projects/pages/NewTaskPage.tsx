import { useMemo, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery, getProjectByKey, getBoards, getTasks, getTaskWorkspaces } from 'wasp/client/operations'
import { ProjectLayout } from '../../shared/layouts/ProjectLayout'
import { useProjectAgents } from '../hooks/useProjectAgents'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { TaskModelField } from '../../models-settings/components/TaskModelField'
import { TaskWorkspaceField, defaultTaskWorkspace } from '../components/TaskWorkspaceField'
import { NewTaskForm } from '../newTask/NewTaskForm'
import { useNewTaskActions } from '../newTask/useNewTaskActions'
import { createNewTask, freshProgress } from '../newTask/createNewTask'
import type { BoardChoice } from '../newTask/newTaskState'

/**
 * A new task in a project, at `/projects/:key/tasks/new`: `?epic=<taskId>` fills its epic (from an epic's page),
 * `?board=<boardId>&column=<name>` its place (from a board).
 */
export function NewTaskPage() {
  const { key = '' } = useParams<{ key: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { data: project } = useQuery(getProjectByKey, key ? { key } : undefined)
  const projectId = project?.id
  const live = { enabled: !!projectId }
  const { data: boardRows } = useQuery(getBoards, projectId ? { projectId } : undefined, live)
  const { data: taskRows } = useQuery(getTasks, projectId ? { projectId } : undefined, live)
  const { data: workspaces } = useQuery(getTaskWorkspaces, projectId ? { projectId, taskId: null } : undefined, live)
  const agents = useProjectAgents(projectId)
  const canWork = useMayWork(projectId)
  const actions = useNewTaskActions()
  // A try that failed after the task was made carries on from there; a success starts a new one.
  const progress = useRef(freshProgress())

  const boards = useMemo(() => (boardRows ?? []) as unknown as BoardChoice[], [boardRows])
  const epics = useMemo(
    () => ((taskRows ?? []) as Array<{ id: string; number: number; title: string; isEpic?: boolean }>).filter(t => t.isEpic),
    [taskRows],
  )
  const defaults = useMemo(
    () => ({ epicId: params.get('epic') ?? undefined, boardId: params.get('board') ?? undefined, column: params.get('column') ?? undefined }),
    [params],
  )
  const back = `/projects/${key}/tasks`

  return (
    <ProjectLayout>
      <div className="flex min-h-0 flex-1 flex-col">
        <h1 className="px-4 pt-4 text-small font-medium text-text-muted">New task{project ? ` in ${project.name}` : ''}</h1>
        {!project || !boardRows ? (
          <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
        ) : !canWork ? (
          <p className="px-4 py-6 text-small text-text-muted">{VIEWER_CANNOT_WORK}</p>
        ) : (
          <NewTaskForm
            defaults={defaults} agents={agents} boards={boards} epics={epics}
            renderModel={({ agentId, value, onChange }) => <TaskModelField projectId={project.id} agentId={agentId} value={value} onChange={onChange} />}
            renderWorkspace={({ value, onChange }) => <TaskWorkspaceField projectId={project.id} value={value === null ? '' : value} onChange={id => onChange(id ?? null)} />}
            onCreate={async values => {
              const workspaceId = values.workspaceId !== undefined ? values.workspaceId : defaultTaskWorkspace(workspaces) || null
              const made = await createNewTask(project.id, values, workspaceId, actions, progress.current)
              progress.current = freshProgress()
              return made
            }}
            onCreated={({ number }) => navigate(`/tasks/${project.key}-${number}`)}
            onCancel={() => navigate(back)}
          />
        )}
      </div>
    </ProjectLayout>
  )
}
