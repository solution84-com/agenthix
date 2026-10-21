import { useParams } from 'react-router'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { TaskSessionPane } from './TaskSessionPane'

/** A task's session as a page of its own, at `/tasks/WEB-27/session` (every screen reviewed spec §3). */
export function TaskSessionPage() {
  const { taskKey = '' } = useParams<{ taskKey: string }>()
  return (
    <AppLayout breadcrumbs={[{ label: 'Tasks', href: '/tasks' }, { label: taskKey, href: `/tasks/${encodeURIComponent(taskKey)}` }, { label: 'Session' }]}>
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
        <TaskSessionPane key={taskKey} taskKey={taskKey} />
      </div>
    </AppLayout>
  )
}
