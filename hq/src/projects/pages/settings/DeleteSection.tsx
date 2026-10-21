import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAction, deleteProject } from 'wasp/client/operations'
import type { DeleteOffer } from './settingsRights'
import type { SettingsProject } from './types'

/** Deleting is the organisation admins'; a project admin is told so, and anyone else sees nothing. */
export function DeleteSection({ project, offer }: { project: SettingsProject; offer: DeleteOffer }) {
  const navigate = useNavigate()
  const remove = useAction(deleteProject)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  if (offer === 'none') return null
  if (offer === 'only-org-admin') {
    return <p className="text-small text-text-muted">Only an organisation admin can delete a project.</p>
  }

  const confirm = async () => {
    setBusy(true)
    setProblem('')
    try {
      await remove({ projectId: project.id })
      navigate('/projects')
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not delete the project')
      setBusy(false)
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="px-4 py-2 text-body font-medium text-danger border border-danger/20 hover:bg-danger/10 rounded-lg transition-colors"
      >
        Delete project
      </button>
    )
  }
  return (
    <div className="p-4 rounded-xl bg-danger/5 border border-danger/15 space-y-3">
      <p className="text-body text-text-secondary">
        This permanently deletes <span className="font-medium text-text-primary">{project.name}</span>, with all its boards and tasks. It cannot be undone.
      </p>
      {problem && <p role="alert" className="text-body text-danger">{problem}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setConfirming(false)} className="px-3 py-1.5 text-body text-text-secondary hover:text-text-primary transition-colors">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={busy}
          className="px-4 py-1.5 text-body font-medium bg-danger hover:bg-danger-hover disabled:opacity-40 text-on-accent rounded-lg transition-colors"
        >
          {busy ? 'Deleting…' : 'Delete project'}
        </button>
      </div>
    </div>
  )
}
