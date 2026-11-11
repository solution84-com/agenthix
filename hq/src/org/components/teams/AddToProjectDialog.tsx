import { useState } from 'react'
import { useQuery, useAction, getProjects, addTeamToProject } from 'wasp/client/operations'
import { Button, FormField, Modal, NativeSelect } from '@agenthix/ui/primitives'
import type { TeamDetail } from '../../teams/teamQueries'
import { ROLE_LABEL, type TeamRole } from './teamWords'
import { useAttentionWhen } from '@agenthix/ui/attention'

type ProjectRow = { id: string; key: string; name: string; personalOwnerId: string | null; isMember?: boolean }

/** Add to a project (every screen reviewed spec §3): every member of the team at once, with one role. The server decides who may. */
export function AddToProjectDialog({ open, team, onClose, onAdded }: { open: boolean; team: TeamDetail; onClose: () => void; onAdded: () => void }) {
  const { data } = useQuery(getProjects, undefined, { enabled: open })
  const add = useAction(addTeamToProject)
  const [projectId, setProjectId] = useState('')
  const [role, setRole] = useState<TeamRole>('MEMBER')
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error)
  const [busy, setBusy] = useState(false)
  const already = new Set(team.projects.map(p => p.id))
  const choices: ProjectRow[] = (data ?? []).filter(p => !p.personalOwnerId && !already.has(p.id))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try { await add({ projectId, teamId: team.id, role }); setProjectId(''); onAdded(); onClose() } catch (err) { setError(err instanceof Error ? err.message : 'Could not add the team') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Add ${team.name} to a project`}>
      <form onSubmit={e => void submit(e)} className="space-y-4">
        <p className="text-small text-text-secondary">Every member of the team joins the project at once, with the role below. Who is in the team, and their role here, is changed in the team.</p>
        <FormField label="Project" htmlFor="add-team-project">
          <NativeSelect id="add-team-project" value={projectId} onChange={e => setProjectId(e.target.value)} required>
            <option value="">Choose a project…</option>
            {choices.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </FormField>
        <FormField label="Role" htmlFor="add-team-role">
          <NativeSelect id="add-team-role" value={role} onChange={e => setRole(e.target.value as TeamRole)}>
            {(Object.keys(ROLE_LABEL) as TeamRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </NativeSelect>
        </FormField>
        {errorDialog}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !projectId}>{busy ? 'Adding…' : 'Add team'}</Button>
        </div>
      </form>
    </Modal>
  )
}
