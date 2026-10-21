import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAction, removeProjectMember, leaveProject } from 'wasp/client/operations'
import { RemovePersonView, type OpenTasksChoice } from '@agenthix/ui/people'
import { useProjectPeopleView } from './useProjectPeopleView'
import { reasonOf } from './peopleErrors'

/** Remove someone from the project, or leave it. Removing asks what happens to the open tasks; leaving asks nothing. */
export function RemoveScreen({ projectId, userId, mode, onCancel, onDone, backLabel = 'People' }: {
  projectId: string
  userId: string
  mode: 'remove' | 'leave'
  onCancel: () => void
  onDone: () => void
  backLabel?: string
}) {
  const navigate = useNavigate()
  const remove = useAction(removeProjectMember)
  const leave = useAction(leaveProject)
  const { view, isLoading } = useProjectPeopleView(projectId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const row = view?.people.find(r => r.person.userId === userId)
  if (isLoading) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (!view || !row) {
    return (
      <div className="space-y-2 px-4 py-6 text-small text-text-muted">
        <p>That person is not in this project.</p>
        <button type="button" onClick={onDone} className="text-accent hover:underline">‹ {backLabel}</button>
      </div>
    )
  }

  const confirm = async (choice: OpenTasksChoice) => {
    setBusy(true)
    setError('')
    try {
      if (mode === 'leave') {
        await leave({ projectId })
        // The person is no longer a member, so this project's screens are no longer theirs.
        navigate('/projects')
        return
      }
      await remove({ projectId, userId, openTasks: choice })
      onDone()
    } catch (err) {
      setError(reasonOf(err, mode === 'leave' ? 'Could not leave the project' : 'Could not remove that person'))
      setBusy(false)
    }
  }

  return (
    <RemovePersonView
      mode={mode}
      person={row.person}
      projectName={view.project.name}
      openTaskCount={row.tasks.todo + row.tasks.inProgress}
      doneTaskCount={row.tasks.done}
      others={view.people.filter(r => r.person.userId !== userId).map(r => r.person)}
      busy={busy}
      error={error}
      onConfirm={choice => void confirm(choice)}
      onCancel={onCancel}
    />
  )
}
