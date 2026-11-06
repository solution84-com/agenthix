import { useMemo, useRef, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { useQuery, getBoards, getTasks, getTaskWorkspaces } from 'wasp/client/operations'
import { AppShell } from '../../shared/layouts/AppShell'
import { TOP_BAR_BUTTON, TopBar, TopBarTitle } from '../../shared/layouts/TopBar'
import { useInToolPanel } from '../../places/toolPanelContext'
import { placeNavOf } from '../../places/placeNav'
import { sectionHref } from '../../places/placeSections'
import { useProjectPlace } from '../place/useProjectPlace'
import { useProjectAgents } from '../hooks/useProjectAgents'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { TaskModelField } from '../../models-settings/components/TaskModelField'
import { TaskWorkspaceField, defaultTaskWorkspace } from '../components/TaskWorkspaceField'
import { NewTaskForm } from '../newTask/NewTaskForm'
import { useNewTaskActions } from '../newTask/useNewTaskActions'
import { createNewTask, freshProgress } from '../newTask/createNewTask'
import type { BoardChoice } from '../newTask/newTaskState'

const TASKS_SECTION = 'tasks'

/**
 * A new task in a project, at `/projects/:key/tasks/new`: `?epic=<taskId>` fills its epic (from an epic's page),
 * `?board=<boardId>&column=<name>` its place (from a board). Shaped like a task's page (T8): inside the project, its
 * navigation beside it and its breadcrumb ending at *New task*, a header bar where a task has its key and state, and
 * the Details beside the description, Create task at the header's right. A Viewer sees the form greyed, with why on
 * Create task.
 */
export function NewTaskPage() {
  const { key = '' } = useParams<{ key: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const inToolPanel = useInToolPanel()
  const { project, place } = useProjectPlace(key)
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
  const back = place ? sectionHref(place, TASKS_SECTION) : `/projects/${key}?tool=${TASKS_SECTION}`

  const content = (
    <div className="flex min-h-0 flex-1 flex-col">
      {!project || !boardRows ? (
        <>
          <header aria-label="New task" className="flex min-h-12 shrink-0 items-center border-b border-border-subtle bg-surface-0 px-4 py-2">
            <h1 className="text-h3 font-semibold text-text-primary max-lg:hidden">New task</h1>
          </header>
          <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
        </>
      ) : (
        <NewTaskForm
          projectName={project.name}
          defaults={defaults} agents={agents} boards={boards} epics={epics} blockedReason={canWork ? null : VIEWER_CANNOT_WORK}
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
  )
  if (inToolPanel) return content
  return <NewTaskFrame place={place} projectName={project?.name} back={back}>{content}</NewTaskFrame>
}

function NewTaskFrame({ place, projectName, back, children }: {
  place: ReturnType<typeof useProjectPlace>['place']
  projectName?: string
  back: string
  children: ReactNode
}) {
  const breadcrumbs = [
    { label: 'Projects', href: '/projects' },
    ...(projectName ? [{ label: projectName, href: place?.homePath, list: 'projects' as const }] : []),
    { label: 'Tasks', href: back },
    { label: 'New task' },
  ]
  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      placeNav={place ? placeNavOf(place, TASKS_SECTION) : null}
      mobileHeader={
        <TopBar leading={<Link to={back} aria-label="Back to Tasks" className={TOP_BAR_BUTTON}><ChevronLeft size={18} /></Link>}>
          <TopBarTitle title="New task" under={projectName} />
        </TopBar>
      }
    >
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </AppShell>
  )
}
