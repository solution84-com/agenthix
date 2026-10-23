import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAction, createPersonalProject } from 'wasp/client/operations'
import { Modal, FormField, Input, Textarea, Button } from '@agenthix/ui/primitives'

type Kind = 'personal' | 'organisation'

const CHOICE = 'w-full rounded-xl border border-border p-3 text-left hover:bg-surface-hover'

/**
 * One *New project* for everyone (models from one place, part 4). People who are not organisation admins see only
 * *Just for you*, with no choice to make; admins choose between that and a project of the organisation, which
 * goes on to the organisation project form. A personal project asks for a name and a description and nothing else.
 */
export function NewProjectDialog({ open, isOrgAdmin, onClose, onOrganisationProject }: {
  open: boolean
  isOrgAdmin: boolean
  onClose: () => void
  onOrganisationProject: () => void
}) {
  const make = useAction(createPersonalProject)
  const navigate = useNavigate()
  const [chosen, setChosen] = useState<Kind | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const kind: Kind | null = isOrgAdmin ? chosen : 'personal'
  const close = () => { setChosen(null); setName(''); setDescription(''); setError(''); setBusy(false); onClose() }

  const choose = (next: Kind) => {
    if (next === 'organisation') { close(); onOrganisationProject() } else setChosen(next)
  }
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      const project = await make({ name: name.trim(), description: description.trim() || undefined })
      close()
      navigate(`/projects/${project.key}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the project')
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="New project">
      {kind === null ? (
        <div className="space-y-3">
          <button type="button" className={CHOICE} onClick={() => choose('personal')}>
            <span className="block text-body font-medium text-text-primary">Just for you</span>
            <span className="block text-small text-text-muted">A personal project. Only you see it; any agent can work in it, as you, with your Claude subscription if you have one.</span>
          </button>
          <button type="button" className={CHOICE} onClick={() => choose('organisation')}>
            <span className="block text-body font-medium text-text-primary">For the organisation</span>
            <span className="block text-small text-text-muted">An organisation project, with members. Organisation admins only.</span>
          </button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (name.trim()) void submit() }}>
          <p className="text-small text-text-muted">Only you see this project. Agents work in it as you, in its own files.</p>
          <FormField label="Name" htmlFor="personal-project-name">
            <Input id="personal-project-name" value={name} onChange={e => setName(e.target.value)} placeholder="Tax return 2026" autoFocus />
          </FormField>
          <FormField label="Description" htmlFor="personal-project-description">
            <Textarea id="personal-project-description" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
          </FormField>
          {error && <p role="alert" className="text-small text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Making…' : 'Make it'}</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
