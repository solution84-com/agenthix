import { useState } from 'react'
import { useQuery, useAction, getProjects, updateProject } from 'wasp/client/operations'
import { Button, FormField, Modal, NativeSelect } from '@agenthix/ui/primitives'
import { WORDS, type Group, type GroupKind } from './groupKinds'
import { ShowAttention } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../shared/failureWords'

type ProjectRow = { id: string; name: string; productId: string | null; programId: string | null; personalOwnerId: string | null }

/** File a project (every screen reviewed spec §3): an existing project is filed under the product or programme. A project is in at most one of each. */
export function FileProjectDialog({ kind, group, open, onClose }: { kind: GroupKind; group: Group; open: boolean; onClose: () => void }) {
  const words = WORDS[kind]
  const { data } = useQuery(getProjects, undefined, { enabled: open })
  const file = useAction(updateProject)
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const field = kind === 'product' ? 'productId' : 'programId'
  const choices: ProjectRow[] = (data ?? []).filter(p => !p.personalOwnerId && p[field] !== group.id)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try { await file({ projectId, [field]: group.id }); setProjectId(''); onClose() } catch (err) { setError(pressFailureWords(err, 'Could not file the project')) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={`File a project under ${group.name}`}>
      <form onSubmit={e => void submit(e)} className="space-y-4">
        <p className="text-small text-text-secondary">Filing a project under a {words.one} only groups it; the {words.one} owns nothing and grants no one access.</p>
        <FormField label="Project" htmlFor="file-project">
          <NativeSelect id="file-project" value={projectId} onChange={e => setProjectId(e.target.value)} required>
            <option value="">Choose a project…</option>
            {choices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </FormField>
        <ShowAttention kind="alert" text={error} title="The project was not filed" onClose={() => setError('')} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !projectId}>{busy ? 'Filing…' : 'File project'}</Button>
        </div>
      </form>
    </Modal>
  )
}
