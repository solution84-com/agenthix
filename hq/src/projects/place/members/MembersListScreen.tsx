import { useState } from 'react'
import { useQuery, getProjectAgents, getPlaceInstructions, getProjectTeams } from 'wasp/client/operations'
import { useAuth } from 'wasp/client/auth'
import { SearchField } from '@agenthix/ui/primitives'
import { ProjectPeopleList } from '@agenthix/ui/people'
import { ProjectAgentsList } from '@agenthix/ui/projects'
import type { ProjectAgentRowData, PlaceInstructionsData } from '@agenthix/ui/agents'
import { MenuButton } from '../../../org/components/menus'
import { useAgentModelLine } from '../../../agents/useAgentModelLine'
import { personAvatarOf } from '../../../people/AuthedPersonAvatar'
import { PersonProfileTrigger } from '../../../people/PersonProfileCard'
import { avatarOf } from '../../agents/avatarOf'
import { filesAddress, useOpenTool } from '../../agents/useAgentsToolUrl'
import { PEOPLE_REFRESH_MS, useProjectPeopleView } from '../people/useProjectPeopleView'
import { ProjectTeamCards } from './ProjectTeamCards'
import type { useMembersUrl } from './useMembersUrl'

type Filter = 'all' | 'people' | 'agents'
const SECTION = 'px-4 pt-4 text-micro font-medium uppercase tracking-wide text-text-muted'

/**
 * A project's Members (every screen reviewed spec §3): its teams as cards, then its people, then its agents, each
 * agent with its state here. Someone there through a team carries the team's name and is changed through the team.
 */
export function MembersListScreen({ projectId, url }: { projectId: string; url: ReturnType<typeof useMembersUrl> }) {
  const { data: me } = useAuth()
  const openTool = useOpenTool()
  const modelLine = useAgentModelLine()
  const { view, isLoading, error } = useProjectPeopleView(projectId)
  const agentsQ = useQuery(getProjectAgents, { projectId }, { refetchInterval: PEOPLE_REFRESH_MS })
  const { data: instructions } = useQuery(getPlaceInstructions, { projectId })
  const teamsQ = useQuery(getProjectTeams, { projectId }, { refetchInterval: PEOPLE_REFRESH_MS })
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [problem, setProblem] = useState('')

  const agentView = agentsQ.data as { canManage: boolean; agents: ProjectAgentRowData[] } | undefined
  if (isLoading || agentsQ.isLoading) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (error || !view || !agentView) return <p role="alert" className="px-4 py-6 text-small text-danger">{error?.message ?? agentsQ.error?.message ?? 'Could not read the members'}</p>

  const needle = search.trim().toLowerCase()
  const teams = (teamsQ.data?.teams ?? []).filter(t => t.name.toLowerCase().includes(needle))
  const people = view.people.filter(r => `${r.person.name} ${r.person.handle ?? ''}`.toLowerCase().includes(needle))
  const agents = agentView.agents.filter(r => `${r.agent.name} ${r.agent.role ?? ''}`.toLowerCase().includes(needle))
  const nameOfTeam = (id: string) => teamsQ.data?.teams.find(t => t.id === id)?.name
  const teamsOfPerson = (userId: string) => {
    const standing = teamsQ.data?.people.find(p => p.userId === userId)
    const names = (standing?.teamIds ?? []).map(nameOfTeam).filter((n): n is string => !!n)
    return standing && names.length > 0 ? { names, direct: standing.direct } : undefined
  }
  const teamsOfAgent = (agentId: string) => (teamsQ.data?.agents.find(a => a.agentId === agentId)?.teamIds ?? []).map(nameOfTeam).filter((n): n is string => !!n)

  const mayManagePeople = view.canManage && !view.project.personal
  const addItems = [
    ...(mayManagePeople ? [{ label: 'A person', hint: 'From the organisation', onSelect: url.toAddPerson }] : []),
    ...(agentView.canManage ? [{ label: 'An agent', hint: "From the organisation's agents", onSelect: url.toAddAgent }] : []),
    ...(mayManagePeople ? [{ label: 'A team', hint: 'Everyone in it, at once', onSelect: url.toAddTeam }] : []),
  ]
  const total = (teamsQ.data?.teams.length ?? 0) + view.people.length + agentView.agents.length
  const chip = (id: Filter, label: string, n: number) => (
    <button
      key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
      className={`rounded-full px-3 py-1 text-small font-medium ${filter === id ? 'bg-accent-subtle text-accent' : 'text-text-muted hover:bg-surface-hover'}`}
    >
      {label} {n}
    </button>
  )

  return (
    <div className="pb-6" data-testid="members-list">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <p className="text-small text-text-muted">
          {view.project.accessLevel === 'OPEN' ? 'Open project' : 'Private project'} · {total} {total === 1 ? 'member' : 'members'}
        </p>
        {addItems.length > 0 && <MenuButton items={addItems}>＋ Add</MenuButton>}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <div role="group" aria-label="Show" className="flex gap-1">
          {chip('all', 'All', view.people.length + agentView.agents.length)}
          {chip('people', 'People', view.people.length)}
          {chip('agents', 'Agents', agentView.agents.length)}
        </div>
        <SearchField label="Search members" value={search} onChange={setSearch} className="ml-auto w-44" />
      </div>
      {problem && <p role="alert" className="px-4 pt-2 text-small text-danger">{problem}</p>}

      {filter === 'all' && teams.length > 0 && (
        <>
          <h4 className={SECTION}>Teams · {teams.length}</h4>
          <div className="pt-2">
            <ProjectTeamCards projectId={projectId} teams={teams} canManage={mayManagePeople} onRemove={url.toRemoveTeam} onChanged={() => void teamsQ.refetch()} onError={setProblem} />
          </div>
        </>
      )}
      {filter !== 'agents' && (
        <>
          <h4 className={SECTION}>People · {people.length}</h4>
          {people.length === 0 && needle ? <p className="px-4 pt-2 text-small text-text-muted">No one matches.</p> : (
            <ProjectPeopleList
              hideHeader people={people} meId={me?.id ?? ''} accessLevel={view.project.accessLevel} now={new Date()}
              renderAvatar={personAvatarOf}
              profileOf={(userId, children) => <PersonProfileTrigger userId={userId} projectId={projectId}>{children}</PersonProfileTrigger>}
              onOpenPerson={url.toPerson} teamsOf={teamsOfPerson}
            />
          )}
        </>
      )}
      {filter !== 'people' && (
        <>
          <h4 className={SECTION}>Agents · {agents.length}</h4>
          <ProjectAgentsList
            hideHeader agents={agents}
            everyAgent={filter === 'agents' ? (instructions as PlaceInstructionsData | undefined)?.everyAgent ?? null : null}
            now={new Date()} renderAvatar={avatarOf} modelLine={modelLine}
            onOpenAgent={url.toAgent} onOpenFile={path => openTool('files', filesAddress(path))} teamsOf={teamsOfAgent}
          />
        </>
      )}
    </div>
  )
}
