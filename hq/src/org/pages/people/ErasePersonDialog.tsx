import { useState } from 'react'
import { useAction, useQuery, erasePerson, getErasedProjectCount } from 'wasp/client/operations'
import { Modal, Button, Input } from '@agenthix/ui/primitives'
import { eraseConfirmationMatches } from './peopleFormat'

type Person = { userId: string; name: string; handle: string | null }

export function ErasePersonDialog({ person, open, onClose }: { person: Person; open: boolean; onClose: () => void }) {
  const erase = useAction(erasePerson)
  const { data: projects } = useQuery(getErasedProjectCount, { userId: person.userId }, { enabled: open })
  const others = projects?.count ?? 0
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    try { await erase({ userId: person.userId, confirm: typed }); onClose() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Erase ${person.name}'s data`}>
      <div className="space-y-4 text-body text-text-secondary">
        <div>
          <p className="font-medium text-text-primary">Deleted</p>
          <p>Their private conversations, space and files, memory, connections, model logins, name and picture.</p>
          {others > 0 && (
            <p>{others} other personal {others === 1 ? 'project' : 'projects'} they made, with {others === 1 ? 'its' : 'their'} conversations, tasks and files.</p>
          )}
        </div>
        <div>
          <p className="font-medium text-text-primary">Stays</p>
          <p>Tasks, comments and task runs stay with their projects, with the name replaced by <em>Former member</em>.</p>
        </div>
        <p className="font-medium text-danger">This cannot be undone.</p>
        <div>
          <label htmlFor="erase-confirm" className="mb-1 block text-small font-medium">Type {person.name} to confirm</label>
          <Input id="erase-confirm" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
        </div>
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={busy || !eraseConfirmationMatches(person, typed)} onClick={() => void submit()}>
            {busy ? 'Erasing…' : 'Erase their data'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
