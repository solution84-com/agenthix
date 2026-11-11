import { useState } from 'react'
import { useQuery, useAction, updateTeam, getOrgPeople, getOrgAgents } from 'wasp/client/operations'
import { Button, Modal, SearchField, DISABLED, FOCUS_RING } from '@agenthix/ui/primitives'
import type { TeamDetail } from '../../teams/teamQueries'
import { AuthedPersonAvatar } from '../../../people/AuthedPersonAvatar'
import { AuthedAgentAvatar } from '../../../shared/components/AuthedAgentAvatar'
import { OrgGroupHeading } from '../orgCardParts'
import { useAttentionWhen } from '@agenthix/ui/attention'

const ROW = 'flex items-center gap-3 border-t border-border-subtle py-2.5 first:border-t-0'
const LINK_BUTTON = `rounded text-small text-text-muted not-disabled:hover:text-danger ${DISABLED}`

const stateWords = { needsYou: 'Needs you', running: 'Running', idle: 'Idle' } as const

/** A team's People and Agents (every screen reviewed spec §3): who is in it, what each agent is doing, and for admins adding and taking out. */
export function TeamMembers({ team, isAdmin, onChanged }: { team: TeamDetail; isAdmin: boolean; onChanged: () => void }) {
  const change = useAction(updateTeam)
  const { data: agentCards } = useQuery(getOrgAgents)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error)
  const [busy, setBusy] = useState(false)
  const nowOf = (agentId: string) => agentCards?.agents.find(a => a.agent.id === agentId)?.now.state

  const apply = async (userIds: string[], agentIds: string[]) => {
    setBusy(true)
    setError('')
    try { await change({ id: team.id, userIds, agentIds }); onChanged() } catch (err) { setError(err instanceof Error ? err.message : 'Could not change the team') } finally { setBusy(false) }
  }

  return (
    <>
      <OrgGroupHeading
        title={`People · ${team.people.length}`}
        aside={isAdmin ? <button type="button" className={`rounded text-link hover:underline ${FOCUS_RING}`} onClick={() => setPicking(true)}>＋ Add people or agents</button> : undefined}
      />
      {team.people.length === 0 && <p className="text-small text-text-muted">No one yet.</p>}
      {team.people.map(p => (
        <div key={p.userId} className={ROW}>
          <AuthedPersonAvatar person={p} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-body text-text-primary">{p.name}</div>
            {p.handle && <div className="text-small text-text-muted">@{p.handle}</div>}
          </div>
          {isAdmin && <button type="button" disabled={busy} className={LINK_BUTTON} onClick={() => void apply(team.userIds.filter(id => id !== p.userId), team.agentIds)}>Take out</button>}
        </div>
      ))}

      <OrgGroupHeading title={`Agents · ${team.agents.length}`} />
      {team.agents.length === 0 && <p className="text-small text-text-muted">No agents yet.</p>}
      {team.agents.map(a => {
        const state = nowOf(a.id)
        return (
          <div key={a.id} className={ROW}>
            <AuthedAgentAvatar name={a.name} avatarUrl={a.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-body text-text-primary">{a.name}</div>
              <div className={`text-small ${state === 'needsYou' ? 'text-warning' : 'text-text-muted'}`}>@{a.handle}{state && ` · ${stateWords[state]}`}</div>
            </div>
            {isAdmin && <button type="button" disabled={busy} className={LINK_BUTTON} onClick={() => void apply(team.userIds, team.agentIds.filter(id => id !== a.id))}>Take out</button>}
          </div>
        )
      })}
      {errorDialog}

      {isAdmin && <PickMembers open={picking} team={team} busy={busy} onClose={() => setPicking(false)} onAdd={apply} />}
    </>
  )
}

function PickMembers({ open, team, busy, onClose, onAdd }: {
  open: boolean
  team: TeamDetail
  busy: boolean
  onClose: () => void
  onAdd: (userIds: string[], agentIds: string[]) => Promise<void>
}) {
  const { data: people } = useQuery(getOrgPeople, undefined, { enabled: open })
  const { data: agents } = useQuery(getOrgAgents, undefined, { enabled: open })
  const [search, setSearch] = useState('')
  const match = (text: string) => text.toLowerCase().includes(search.trim().toLowerCase())
  const candidatePeople = (people?.people ?? []).filter(r => r.person.state === 'active' && !team.userIds.includes(r.person.userId) && match(`${r.person.name} ${r.person.handle ?? ''}`))
  const candidateAgents = (agents?.agents ?? []).filter(a => !team.agentIds.includes(a.agent.id) && match(`${a.agent.name} ${a.agent.handle}`))
  return (
    <Modal open={open} onClose={onClose} title="Add to the team">
      <SearchField label="Search people and agents" value={search} onChange={setSearch} className="mb-3 block w-full" />
      <div className="max-h-80 overflow-y-auto">
        {candidatePeople.map(r => (
          <div key={r.person.userId} className={ROW}>
            <AuthedPersonAvatar person={r.person} size="sm" />
            <span className="min-w-0 flex-1 truncate text-body text-text-primary">{r.person.name}</span>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void onAdd([...team.userIds, r.person.userId], team.agentIds)}>Add</Button>
          </div>
        ))}
        {candidateAgents.map(a => (
          <div key={a.agent.id} className={ROW}>
            <AuthedAgentAvatar name={a.agent.name} avatarUrl={a.agent.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1 truncate text-body text-text-primary">{a.agent.name}<span className="ml-2 text-small text-text-muted">Agent</span></span>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void onAdd(team.userIds, [...team.agentIds, a.agent.id])}>Add</Button>
          </div>
        ))}
        {candidatePeople.length + candidateAgents.length === 0 && <p className="py-4 text-center text-small text-text-muted">No one left to add.</p>}
      </div>
      <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={onClose}>Done</Button></div>
    </Modal>
  )
}
