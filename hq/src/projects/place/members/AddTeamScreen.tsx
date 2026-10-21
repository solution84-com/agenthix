import { useState } from 'react'
import { useQuery, useAction, getTeams, getProjectTeams, addTeamToProject } from 'wasp/client/operations'
import { PanelHeaderContent, ViewHeaderRow, SearchField, NativeSelect } from '@agenthix/ui/primitives'
import { teamMix, ROLE_LABEL, type TeamRole } from '../../../org/components/teams/teamWords'
import { reasonOf } from '../people/peopleErrors'

const BUTTON = 'shrink-0 rounded-lg border border-border bg-surface-1 px-3 py-1 text-small font-medium text-text-primary hover:bg-surface-hover disabled:opacity-40'

/** Add a team to the project (every screen reviewed spec §3): every member of the team joins at once, with one role. */
export function AddTeamScreen({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { data: teams } = useQuery(getTeams)
  const { data: here, refetch } = useQuery(getProjectTeams, { projectId })
  const add = useAction(addTeamToProject)
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<TeamRole>('MEMBER')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const inProject = new Set((here?.teams ?? []).map(t => t.id))
  const candidates = (teams ?? []).filter(t => !inProject.has(t.id) && t.name.toLowerCase().includes(query.trim().toLowerCase()))

  const pick = async (teamId: string) => {
    setBusyId(teamId)
    setError('')
    try { await add({ projectId, teamId, role }); await refetch(); onBack() } catch (err) { setError(reasonOf(err, 'Could not add that team')); setBusyId(null) }
  }

  return (
    <div className="space-y-3 px-4 pb-6">
      <ViewHeaderRow><PanelHeaderContent back="Members" onBack={onBack} title="Add a team" /></ViewHeaderRow>
      <p className="pt-4 text-small text-text-secondary">Every person and agent in the team joins at once. Each can still be removed through the team only.</p>
      <label className="flex items-center gap-2 text-small text-text-muted">
        Add as
        <NativeSelect size="sm" className="w-32" value={role} onChange={e => setRole(e.target.value as TeamRole)} aria-label="The team's role here">
          {(Object.keys(ROLE_LABEL) as TeamRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </NativeSelect>
      </label>
      <SearchField label="Search teams" value={query} onChange={setQuery} className="w-full" />
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      {!teams ? <p className="text-small text-text-muted">Loading…</p> : candidates.length === 0 ? (
        <p className="text-small text-text-muted">{teams.length === 0 ? 'The organisation has no teams yet. Admins make them under Organisation › Teams.' : 'No team left to add.'}</p>
      ) : (
        <ul className="space-y-2">
          {candidates.map(t => (
            <li key={t.id} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-1 px-3 py-2">
              <span className="min-w-0 flex-1">
                <b className="block truncate text-body font-semibold text-text-primary">{t.name}</b>
                <span className="block truncate text-small text-text-muted">{teamMix(t.people.length, t.agents.length)}</span>
              </span>
              <button type="button" className={BUTTON} disabled={busyId !== null} aria-label={`Add ${t.name}`} onClick={() => void pick(t.id)}>Add</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
