import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAction, deleteProject } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import type { DeleteOffer } from './settingsRights'
import type { SettingsProject } from './types'

/**
 * Deleting is the organisation admins'; a project admin is told so, and anyone else sees nothing. A personal
 * project's owner deletes it. In every case the project's key is typed before Delete project works.
 */
export function DeleteSection({ project, offer }: { project: SettingsProject; offer: DeleteOffer }) {
  const navigate = useNavigate()
  const remove = useAction(deleteProject)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toUpperCase() === project.key

  if (offer === 'none') return null
  if (offer === 'only-org-admin') {
    return <p className="text-small text-text-muted">Deletes the project with all its boards, tasks and files. Only an organisation admin can delete a project.</p>
  }

  const close = () => { setOpen(false); setTyped(''); setProblem('') }
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

  return (
    <div className="space-y-2">
      <p className="text-small text-text-muted">Deletes the project with all its boards, tasks and files. Organisation admins only.</p>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>Delete project…</Button>
      <Modal open={open} onClose={close} title={`Delete ${project.name}?`} maxWidth="max-w-md">
        <p className="text-body text-text-secondary">This deletes the project with all its boards, tasks and files. It cannot be undone.</p>
        <label htmlFor="delete-confirm" className="mt-4 block text-small font-medium text-text-secondary">
          Type the project&apos;s key, <span className="font-mono text-text-primary">{project.key}</span>, to delete it
        </label>
        <input id="delete-confirm" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off"
          className="mt-1 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 font-mono text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
        {problem && <p role="alert" className="mt-3 text-body text-danger">{problem} Nothing was changed.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant="danger" disabled={busy || !matches} onClick={() => void confirm()}>{busy ? 'Deleting…' : 'Delete project'}</Button>
        </div>
      </Modal>
    </div>
  )
}
