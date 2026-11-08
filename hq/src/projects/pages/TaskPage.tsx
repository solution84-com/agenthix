import { useNavigate, useParams, useSearchParams } from 'react-router'
import { AppShell } from '../../shared/layouts/AppShell'
import { placeNavOf } from '../../places/placeNav'
import { sectionHref } from '../../places/placeSections'
import { PlaceDrillMobileHeader } from '../../places/components/PlaceDrillMobileHeader'
import { useProjectPlace } from '../place/useProjectPlace'
import { TaskInToolView } from './TaskInToolView'
import { taskFileOf, taskFileParams, type OpenTaskFile } from './useTasksToolUrl'
import { tasksListPath } from '../components/taskPageState'

const TASKS_SECTION = 'tasks'

/**
 * A task as a page of its own (TK1), at `/tasks/WEB-27`: where it opens from anywhere but a project's Tasks tool —
 * Your tasks, a notification, a link. It sits in its project, with the project's menu beside it and the breadcrumb
 * through its Tasks; on a phone the top bar is ‹ Tasks, the key, and the ⋯ that holds the page's actions.
 */
export function TaskPage() {
  const { taskKey = '' } = useParams<{ taskKey: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const projectKey = /^([A-Z]{2,6})-\d+$/.exec(taskKey)?.[1]
  const { project, place } = useProjectPlace(projectKey)
  const back = place ? sectionHref(place, TASKS_SECTION) : tasksListPath(taskKey)
  const nav = place ? placeNavOf(place, TASKS_SECTION) : null
  // Its file is in the address as in the Tasks tool: `?file=` for a working file, `?attachment=` for an attachment.
  const named = new URLSearchParams(params)
  named.set('task', taskKey)
  const openFile = taskFileOf(named)
  const onOpenFile = (file: OpenTaskFile | null) => setParams(prev => {
    const next = new URLSearchParams(prev)
    for (const [name, value] of Object.entries(taskFileParams(file))) {
      if (value) next.set(name, value)
      else next.delete(name)
    }
    return next
  }, { replace: true })
  const breadcrumbs = [
    { label: 'Projects', href: '/projects' },
    ...(project ? [{ label: project.name, href: place?.homePath, list: 'projects' as const }] : []),
    { label: 'Tasks', href: back },
    { label: taskKey },
  ]
  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      placeNav={nav}
      mobileHeader={nav ? <PlaceDrillMobileHeader nav={nav} backHref={back} title={taskKey} /> : undefined}
    >
      <main className="min-w-0 flex-1 overflow-y-auto pb-8">
        <TaskInToolView
          key={taskKey} taskKey={taskKey} focusWaiting={params.get('at') === 'waiting'}
          openFile={openFile} onOpenFile={onOpenFile}
          onGone={() => navigate(back)} onOpenSession={() => navigate(`/tasks/${encodeURIComponent(taskKey)}/session`)}
        />
      </main>
    </AppShell>
  )
}
