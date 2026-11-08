import { useMemo, useRef, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import type { CustomFieldView, TaskTypeView } from '@agenthix/core'
import { useQuery, getTaskTypes, getTasks, getTaskWorkspaces, getProjectSprints, getCustomFields } from 'wasp/client/operations'
import { AppShell } from '../../shared/layouts/AppShell'
import { FormTopBar } from '../../shared/layouts/TopBar'
import { useUsername } from '../../shared/useUsername'
import { useInToolPanel } from '../../places/toolPanelContext'
import { placeNavOf } from '../../places/placeNav'
import { sectionHref } from '../../places/placeSections'
import { useProjectPlace } from '../place/useProjectPlace'
import { useProjectAgents } from '../hooks/useProjectAgents'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { TaskModelField } from '../../models-settings/components/TaskModelField'
import { TaskWorkspaceField, defaultTaskWorkspace } from '../components/TaskWorkspaceField'
import { NewTaskForm, NEW_TASK_FORM_ID } from '../newTask/NewTaskForm'
import { useNewTaskActions } from '../newTask/useNewTaskActions'
import { createNewTask, freshProgress } from '../newTask/createNewTask'
import { sprintPickChoices } from './taskSelectionWords'
import type { ProjectSprints } from '../projectSprintView'
import { isEpicTask } from '../components/taskKind'

const TASKS_SECTION = 'tasks'

/**
 * A new task in a project, at `/projects/:key/tasks/new` (TK1, D11, N2): `?epic=<taskId>` fills its epic (from an
 * epic's Add a task), `?type=<typeId>` its type and `?column=<columnId>` the column it starts in (from a board's
 * column); otherwise it is a Task in Backlog, at the bottom of the project's order. Shaped like a task's page: inside
 * the project, its navigation beside it and its breadcrumb ending at *New task*, a header bar where a task has its
 * key, and the Details beside the description, Create task at the header's right; on a phone a focused form (✕, the
 * title, Create task). A Viewer sees the form greyed, with why on Create task.
 */
export function NewTaskPage() {
  const { key = '' } = useParams<{ key: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const inToolPanel = useInToolPanel()
  const { project, place } = useProjectPlace(key)
  const projectId = project?.id
  const live = { enabled: !!projectId }
  const { data: typeRows } = useQuery(getTaskTypes, projectId ? { projectId } : undefined, live)
  const { data: taskRows } = useQuery(getTasks, projectId ? { projectId } : undefined, live)
  const { data: workspaces } = useQuery(getTaskWorkspaces, projectId ? { projectId, taskId: null } : undefined, live)
  const { data: series } = useQuery(getProjectSprints, projectId ? { projectId } : undefined, live)
  const { data: fieldRows } = useQuery(getCustomFields, projectId ? { projectId } : undefined, live)
  const agents = useProjectAgents(projectId)
  const canWork = useMayWork(projectId)
  const personName = useUsername()
  const actions = useNewTaskActions()
  // A try that failed after the task was made carries on from there; a success starts a new one.
  const progress = useRef(freshProgress())

  const types = useMemo(() => (typeRows ?? []) as TaskTypeView[], [typeRows])
  const epics = useMemo(
    () => ((taskRows ?? []) as Array<{ id: string; number: number; title: string; type?: { kind: string } | null }>).filter(isEpicTask),
    [taskRows],
  )
  const sprints = useMemo(() => sprintPickChoices(series as ProjectSprints | undefined), [series])
  const fields = useMemo(() => (fieldRows ?? []) as CustomFieldView[], [fieldRows])
  const defaults = useMemo(
    () => ({ epicId: params.get('epic') ?? undefined, typeId: params.get('type') ?? undefined, columnId: params.get('column') ?? undefined }),
    [params],
  )
  const back = place ? sectionHref(place, TASKS_SECTION) : `/projects/${key}?tool=${TASKS_SECTION}`

  const content = (
    <div className="flex min-h-0 flex-1 flex-col">
      {!project || !typeRows ? (
        <>
          <header aria-label="New task" className="flex min-h-[52px] shrink-0 items-center border-b border-border-subtle bg-surface-1 px-6 py-2 max-lg:hidden">
            <h1 className="text-body font-semibold text-text-primary">New task</h1>
          </header>
          <p className="px-6 py-4 text-small text-text-muted max-sm:px-3">Loading…</p>
        </>
      ) : (
        <NewTaskForm
          defaults={defaults} types={types} agents={agents} epics={epics} sprints={sprints} fields={fields} personName={personName}
          blockedReason={canWork ? null : VIEWER_CANNOT_WORK} topBarOnPhone={!inToolPanel}
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
  return (
    <NewTaskFrame place={place} projectName={project?.name} back={back} blockedReason={project && !canWork ? VIEWER_CANNOT_WORK : undefined}>
      {content}
    </NewTaskFrame>
  )
}

function NewTaskFrame({ place, projectName, back, blockedReason, children }: {
  place: ReturnType<typeof useProjectPlace>['place']
  projectName?: string
  back: string
  blockedReason?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
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
        <FormTopBar
          title="New task" under={projectName} onCancel={() => navigate(back)}
          submit={{ label: 'Create task', formId: NEW_TASK_FORM_ID, disabled: !!blockedReason, why: blockedReason }}
        />
      }
    >
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </AppShell>
  )
}
