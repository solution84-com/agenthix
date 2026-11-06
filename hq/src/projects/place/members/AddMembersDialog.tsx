import { useState, type ReactNode } from 'react'
import { useQuery, useAction, listPeopleForProject, addProjectMember, getAgents, getTeams, getProjectTeams, addAgentToProject } from 'wasp/client/operations'
import { Button, Modal, SearchField } from '@agenthix/ui/primitives'
import { matchesPerson, orgRoleLabel, pickerSubline, type PickablePersonData } from '@agenthix/ui/people'
import { useAuth } from 'wasp/client/auth'
import { useNavigate } from 'react-router'
import type { ProjectRole } from '../../memberList'
import { teamMix } from '../../../org/components/teams/teamWords'
import { personAvatarOf } from '../../../people/AuthedPersonAvatar'
import { orgInvitePath } from '../../../people/orgPeoplePaths'
import { useIsAdmin } from '../../../shared/hooks/useIsAdmin'
import { avatarOf } from '../../agents/avatarOf'
import type { Attention } from '../../../shared/components/AttentionDialog'
import { reasonOf } from '../people/peopleErrors'
import { AddTeamStep } from './AddTeamStep'
import { ROLE_ORDER, ROLE_WORD } from './memberWords'

export type AddTab = 'people' | 'agents' | 'teams'
const TAB_WORD: Record<AddTab, string> = { people: 'People', agents: 'Agents', teams: 'Teams' }

type Props = {
  projectId: string
  projectName: string
  tab: AddTab
  /** The tabs this person may use: people and teams for whoever manages people, agents for whoever assigns them. */
  tabs: AddTab[]
  onTab: (tab: AddTab) => void
  onClose: () => void
  onChanged: () => void
  onProblem: (attention: Attention) => void
}

/** One row of every tab: a picture, a name and a line, and Add or Already here at the right. */
function PickRow({ avatar, name, line, here, hereText = 'Already here', addLabel, onAdd, busy }: {
  avatar: ReactNode; name: string; line: string; here: boolean; hereText?: string; addLabel?: string; onAdd: () => void; busy: boolean
}) {
  return (
    <li className="flex items-center gap-3 px-1 py-2">
      <span className="shrink-0">{avatar}</span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-body font-semibold text-text-primary">{name}</b>
        <span className="block truncate text-small text-text-muted">{line}</span>
      </span>
      {here
        ? <span className="shrink-0 text-small text-text-muted">{hereText}</span>
        : <Button variant="secondary" size="sm" disabled={busy} aria-label={`Add ${name}`} onClick={onAdd}>{addLabel ?? 'Add'}</Button>}
    </li>
  )
}

const LIST = 'max-h-[50vh] divide-y divide-border-subtle overflow-y-auto'
const empty = (text: string) => <p className="py-4 text-small text-text-muted">{text}</p>

function PeopleTab({ projectId, onChanged, onProblem }: Pick<Props, 'projectId' | 'onChanged' | 'onProblem'>) {
  const { data: me } = useAuth()
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const { data, refetch } = useQuery(listPeopleForProject, { projectId })
  const add = useAction(addProjectMember)
  const [role, setRole] = useState<ProjectRole>('MEMBER')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const people = ((data ?? []) as PickablePersonData[]).filter(p => matchesPerson(p.person, query))
  const pick = async (userId: string) => {
    setBusy(true)
    try { await add({ projectId, userId, role }); await refetch(); onChanged() } catch (err) {
      onProblem({ text: reasonOf(err, 'That person could not be added. Nothing was changed.'), retry: () => void pick(userId) })
    } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-small">
        <span className="text-text-muted">Add as</span>
        <div role="radiogroup" aria-label="Add as" className="inline-flex overflow-hidden rounded-lg border border-border">
          {ROLE_ORDER.map(r => (
            <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)}
              className={`px-3 py-1 text-small ${role === r ? 'bg-accent text-on-accent' : 'bg-surface-1 text-text-secondary hover:bg-surface-hover'}`}>
              {ROLE_WORD[r]}
            </button>
          ))}
        </div>
      </div>
      <SearchField label="Search by name or @handle" value={query} onChange={setQuery} className="w-full" />
      {!data ? empty('Loading…') : people.length === 0 ? empty('No one matches.') : (
        <ul className={LIST}>
          {people.map(({ person, orgRole, projectCount, isMember }) => (
            <PickRow
              key={person.userId} avatar={personAvatarOf(person, 'md')} name={person.name} here={isMember} busy={busy} onAdd={() => void pick(person.userId)}
              line={pickerSubline({ handle: person.handle, roleLabel: orgRoleLabel(orgRole), projectCount, isMe: person.userId === me?.id })}
            />
          ))}
        </ul>
      )}
      {isAdmin && (
        <p className="text-small text-text-muted">
          Someone new? <button type="button" className="text-accent hover:underline" onClick={() => navigate(orgInvitePath())}>Invite them in Organisation ›</button>
        </p>
      )}
    </div>
  )
}

function AgentsTab({ projectId, onChanged, onProblem }: Pick<Props, 'projectId' | 'onChanged' | 'onProblem'>) {
  const { data: all } = useQuery(getAgents)
  const { data: here, refetch } = useQuery(getProjectTeams, { projectId })
  const add = useAction(addAgentToProject)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const assigned = new Set((here?.agents ?? []).map(a => a.agentId))
  const q = query.trim().toLowerCase()
  const agents = (all ?? []).filter(a => `${a.name} ${a.handle} ${a.role ?? ''}`.toLowerCase().includes(q))
  const pick = async (agentId: string) => {
    setBusy(true)
    try { await add({ projectId, agentId }); await refetch(); onChanged() } catch (err) {
      onProblem({ text: reasonOf(err, 'That agent could not be assigned. Nothing was changed.'), retry: () => void pick(agentId) })
    } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <SearchField label="Search the organisation's agents" value={query} onChange={setQuery} className="w-full" />
      {!all ? empty('Loading…') : agents.length === 0 ? empty('No agent matches.') : (
        <ul className={LIST}>
          {agents.map(a => (
            <PickRow key={a.id} avatar={avatarOf(a, 'md')} name={a.name} line={a.role ?? `@${a.handle}`} here={assigned.has(a.id)} busy={busy} onAdd={() => void pick(a.id)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TeamsTab({ projectId, onChoose }: { projectId: string; onChoose: (teamId: string) => void }) {
  const { data: teams } = useQuery(getTeams)
  const { data: here } = useQuery(getProjectTeams, { projectId })
  const [query, setQuery] = useState('')
  const roleHere = new Map((here?.teams ?? []).map(t => [t.id, t.role]))
  const shown = (teams ?? []).filter(t => t.name.toLowerCase().includes(query.trim().toLowerCase()))
  return (
    <div className="space-y-3">
      <SearchField label="Search the organisation's teams" value={query} onChange={setQuery} className="w-full" />
      {!teams ? empty('Loading…') : teams.length === 0 ? empty('The organisation has no teams yet. Admins make them under Manage organisation › Teams.') : shown.length === 0 ? empty('No team matches.') : (
        <ul className={LIST}>
          {shown.map(t => {
            const role = roleHere.get(t.id)
            return (
              <PickRow
                key={t.id} name={t.name} here={role !== undefined} busy={false} addLabel="Add…" onAdd={() => onChoose(t.id)}
                avatar={<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-small font-semibold text-accent">{t.name.trim().charAt(0).toUpperCase()}</span>}
                line={`${teamMix(t.people.length, t.agents.length)}${role ? ` · here as ${ROLE_WORD[role]}` : ''}`}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Add members: one dialog, a tab each for people, agents and teams, one row layout in all three. People are added
 * with a role chosen at the top; agents have none (adr-0062); a team opens its own step, showing who joins and as
 * what before anything is done (adr-0103).
 */
export function AddMembersDialog(p: Props) {
  const [teamId, setTeamId] = useState<string | null>(null)
  const { data: teams } = useQuery(getTeams)
  const team = teamId ? teams?.find(t => t.id === teamId) : undefined
  if (team) {
    return (
      <Modal open onClose={p.onClose} title={`Add ${team.name} to ${p.projectName}`} maxWidth="max-w-xl">
        <AddTeamStep projectId={p.projectId} team={team} onBack={() => setTeamId(null)} onDone={() => { setTeamId(null); p.onChanged() }} onProblem={p.onProblem} />
      </Modal>
    )
  }
  return (
    <Modal open onClose={p.onClose} title={`Add to ${p.projectName}`} maxWidth="max-w-xl">
      <div role="tablist" aria-label="Add" className="mb-4 flex gap-1 border-b border-border-subtle">
        {p.tabs.map(t => (
          <button key={t} type="button" role="tab" aria-selected={p.tab === t} onClick={() => p.onTab(t)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-small font-medium ${p.tab === t ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-primary'}`}>
            {TAB_WORD[t]}
          </button>
        ))}
      </div>
      {p.tab === 'people' && <PeopleTab {...p} />}
      {p.tab === 'agents' && <AgentsTab {...p} />}
      {p.tab === 'teams' && <TeamsTab projectId={p.projectId} onChoose={setTeamId} />}
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={p.onClose}>Done</Button>
      </div>
    </Modal>
  )
}
