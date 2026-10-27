import { useNavigate, useParams, useSearchParams } from 'react-router'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { TaskInToolView } from './TaskInToolView'
import { taskFileOf, taskFileParams, type OpenTaskFile } from './useTasksToolUrl'

/**
 * A task as a page of its own (every screen reviewed spec §3), at `/tasks/WEB-27`: where it opens from
 * anywhere but a project's Tasks tool — Your tasks, a notification, a link. The same view the tool
 * draws, with room for its facts beside it; the project is one of them.
 */
export function TaskPage() {
  const { taskKey = '' } = useParams<{ taskKey: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
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
  return (
    <AppLayout breadcrumbs={[{ label: 'Tasks', href: '/tasks' }, { label: taskKey }]}>
      <div className="mx-auto w-full max-w-5xl pb-8">
        <TaskInToolView
          key={taskKey} taskKey={taskKey} focusWaiting={params.get('at') === 'waiting'} projectLink
          openFile={openFile} onOpenFile={onOpenFile}
          onGone={() => navigate('/tasks')} onOpenSession={() => navigate(`/tasks/${encodeURIComponent(taskKey)}/session`)}
        />
      </div>
    </AppLayout>
  )
}
