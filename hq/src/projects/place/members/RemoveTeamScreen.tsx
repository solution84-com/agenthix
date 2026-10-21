import { useState } from 'react'
import { useQuery, useAction, getProjectTeams, getProjectAgents, removeTeamFromProject } from 'wasp/client/operations'
import { PanelHeaderContent, ViewHeaderRow, NativeSelect } from '@agenthix/ui/primitives'
import type { ProjectAgentRowData } from '@agenthix/ui/agents'
import { useProjectPeopleView } from '../people/useProjectPeopleView'
import { reasonOf } from '../people/peopleErrors'

const WAIT = 'wait'
const NONE = 'none'
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Remove a team (every screen reviewed spec §3): it goes as a unit, with everyone here only through it. Their open tasks
 * need a destination, chosen first and with no default, as removing one person asks (adr-0103).
 */
export function RemoveTeamScreen({ projectId, teamId, onCancel, onDone }: { projectId: string; teamId: string; onCancel: () => void; onDone: () => void }) {
  const { data: teamsData, isLoading } = useQuery(getProjectTeams, { projectId })
  const { view } = useProjectPeopleView(projectId)
  const { data: agentsData } = useQuery(getProjectAgents, { projectId })
  const remove = useAction(removeTeamFromProject)
  const [people, setPeople] = useState('')
  const [agents, setAgents] = useState('')
  const [newDefault, setNewDefault] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const team = teamsData?.teams.find(t => t.id === teamId)
  const agentRows = (agentsData as { agents: ProjectAgentRowData[] } | undefined)?.agents ?? []
  if (isLoading || !teamsData || !view) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (!team) {
    return (
      <div className="space-y-2 px-4 py-6 text-small text-text-muted">
        <p>That team is not in this project.</p>
        <button type="button" onClick={onDone} className="text-accent hover:underline">‹ Members</button>
      </div>
    )
  }

  const onlyThis = (teamIds: string[], direct: boolean) => !direct && teamIds.length === 1 && teamIds[0] === teamId
  const leavingPeople = teamsData.people.filter(p => onlyThis(p.teamIds, p.direct)).map(p => p.userId)
  const leavingAgents = teamsData.agents.filter(a => onlyThis(a.teamIds, a.direct)).map(a => a.agentId)
  const staying = view.people.filter(r => !leavingPeople.includes(r.person.userId))
  const stayingAgents = agentRows.filter(r => !leavingAgents.includes(r.agent.id))
  const defaultLeaves = agentRows.some(r => r.isDefault && leavingAgents.includes(r.agent.id))
  const ready = (leavingPeople.length === 0 || people !== '') && (leavingAgents.length === 0 || agents !== '') && (!defaultLeaves || newDefault !== '')

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await remove({
        projectId, teamId,
        openTasks: people === WAIT || people === '' ? { kind: 'wait' } : { kind: 'person', userId: people },
        agentOpenTasksTo: agents === NONE || agents === '' ? null : agents,
        ...(defaultLeaves ? { newDefaultAgentId: newDefault === NONE ? null : newDefault } : {}),
      })
      onDone()
    } catch (err) {
      setError(reasonOf(err, 'Could not remove the team'))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 px-4 pb-6">
      <ViewHeaderRow><PanelHeaderContent back="Members" onBack={onCancel} title={`Remove ${team.name}`} /></ViewHeaderRow>
      <p className="pt-4 text-body text-text-primary">
        {team.name} leaves this project as a unit, with {plural(leavingPeople.length, 'person', 'people')} and {plural(leavingAgents.length, 'agent')} who {leavingPeople.length + leavingAgents.length === 1 ? 'is' : 'are'} here only through it. Anyone also here in person or through another team stays.
      </p>
      {leavingPeople.length > 0 && (
        <label className="block space-y-1 text-small text-text-secondary">
          Their open tasks
          <NativeSelect value={people} onChange={e => setPeople(e.target.value)}>
            <option value="">Choose…</option>
            <option value={WAIT}>Leave them waiting</option>
            {staying.map(r => <option key={r.person.userId} value={r.person.userId}>Give them to {r.person.name}</option>)}
          </NativeSelect>
        </label>
      )}
      {leavingAgents.length > 0 && (
        <label className="block space-y-1 text-small text-text-secondary">
          The open tasks of their agents
          <NativeSelect value={agents} onChange={e => setAgents(e.target.value)}>
            <option value="">Choose…</option>
            <option value={NONE}>Leave them without an agent</option>
            {stayingAgents.map(r => <option key={r.agent.id} value={r.agent.id}>Give them to {r.agent.name}</option>)}
          </NativeSelect>
        </label>
      )}
      {defaultLeaves && (
        <label className="block space-y-1 text-small text-text-secondary">
          The project's default agent leaves with them. The new default
          <NativeSelect value={newDefault} onChange={e => setNewDefault(e.target.value)}>
            <option value="">Choose…</option>
            <option value={NONE}>None</option>
            {stayingAgents.map(r => <option key={r.agent.id} value={r.agent.id}>{r.agent.name}</option>)}
          </NativeSelect>
        </label>
      )}
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={!ready || busy} onClick={() => void confirm()} className="rounded-lg bg-danger px-4 py-2 text-body font-medium text-on-accent hover:bg-danger-hover disabled:opacity-40">{busy ? 'Removing…' : 'Remove team'}</button>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-body text-text-secondary hover:bg-surface-hover">Cancel</button>
      </div>
    </div>
  )
}
