import { useQuery, getWorkplacePeople, getOrgAgents, getTeams, getProducts, getPrograms, getLibrary } from 'wasp/client/operations'
import type { LibraryItem } from '../../library/packages/packageActions'
import { AuthedPersonAvatar } from '../../people/AuthedPersonAvatar'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { BigNumber, CardGrid, CardLine, FaceStack, OrgCard, OrgGroupHeading } from './orgCardParts'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const weekday = (at: Date | string) => new Date(at).toLocaleDateString(undefined, { weekday: 'short' })
const LIST = 3

function PeopleCard({ isAdmin }: { isAdmin: boolean }) {
  const { data } = useQuery(getWorkplacePeople)
  const waiting = data?.waitingInvitations
  return (
    <OrgCard title="People" to={isAdmin ? '/org/people' : undefined}>
      <BigNumber value={data?.count ?? '–'} label={data?.count === 1 ? 'person' : 'people'} />
      {data && (
        <FaceStack more={data.count - data.faces.length}>
          {data.faces.map(p => <AuthedPersonAvatar key={p.userId} person={p} size="sm" />)}
        </FaceStack>
      )}
      {waiting && waiting.count > 0 && (
        <CardLine tone="attention" left={`${plural(waiting.count, 'invitation')} waiting`} right={waiting.latestAt ? `sent ${weekday(waiting.latestAt)}` : undefined} />
      )}
    </OrgCard>
  )
}

function AgentsCard() {
  const { data } = useQuery(getOrgAgents)
  const agents = data?.agents ?? []
  const needs = agents.filter(a => a.now.state === 'needsYou').length
  const running = agents.filter(a => a.now.state === 'running').length
  return (
    <OrgCard title="Agents" to={data?.canManage ? '/org/agents' : '/agents'}>
      <BigNumber value={data ? agents.length : '–'} label={agents.length === 1 ? 'agent' : 'agents'} />
      {data && (
        <CardLine
          tone={needs > 0 ? 'attention' : undefined}
          left={[needs > 0 ? `${needs} need${needs === 1 ? 's' : ''} you` : null, running > 0 ? `${running} running` : null].filter(Boolean).join(' · ') || 'Nothing running'}
        />
      )}
      <FaceStack more={Math.max(0, agents.length - 5)}>
        {agents.slice(0, 5).map(a => <AuthedAgentAvatar key={a.agent.id} name={a.agent.name} avatarUrl={a.agent.avatarUrl} size="sm" />)}
      </FaceStack>
    </OrgCard>
  )
}

function TeamsCard() {
  const { data: teams } = useQuery(getTeams)
  return (
    <OrgCard title="Teams" to="/org/teams">
      <BigNumber value={teams?.length ?? '–'} label={teams?.length === 1 ? 'team' : 'teams'} />
      {(teams ?? []).slice(0, LIST).map(t => (
        <CardLine key={t.id} left={t.name} right={`${plural(t.people.length, 'person', 'people')} · ${plural(t.agents.length, 'agent')}`} />
      ))}
      {teams && teams.length === 0 && <CardLine left="A group of people and agents with a purpose" />}
    </OrgCard>
  )
}

function ProductsCard() {
  const { data: products } = useQuery(getProducts)
  const rows = (products ?? []) as Array<{ id: string; name: string; _count: { projects: number } }>
  return (
    <OrgCard title="Products" to="/products">
      <BigNumber value={products ? rows.length : '–'} label={rows.length === 1 ? 'product' : 'products'} />
      {rows.slice(0, LIST).map(p => <CardLine key={p.id} left={p.name} right={plural(p._count.projects, 'project')} />)}
      {products && rows.length === 0 && <CardLine left="What the organisation makes" />}
    </OrgCard>
  )
}

function ProgramsCard() {
  const { data: programs } = useQuery(getPrograms)
  const rows = (programs ?? []) as Array<{ id: string; name: string; status: string; _count: { projects: number } }>
  const active = rows.filter(p => p.status === 'active')
  return (
    <OrgCard title="Programs" to="/programs">
      <BigNumber value={programs ? active.length : '–'} label="active" />
      {active.slice(0, LIST).map(p => <CardLine key={p.id} left={p.name} right={plural(p._count.projects, 'project')} />)}
      {programs && active.length === 0 && <CardLine left={rows.length === 0 ? 'A goal several projects work towards' : `${plural(rows.length, 'programme')}, none active`} />}
    </OrgCard>
  )
}

function LibraryCard() {
  const { data } = useQuery(getLibrary)
  const kinds: Array<[string, LibraryItem[]]> = data ? [['agents', data.agents], ['boards', data.boards], ['skills', data.skills], ['teams', data.teams]] : []
  const total = kinds.reduce((n, [, items]) => n + items.length, 0)
  const madeHere = kinds.reduce((n, [, items]) => n + items.filter(i => i.source === 'MADE_HERE').length, 0)
  return (
    <OrgCard title="Library" to="/library">
      <BigNumber value={data ? total : '–'} label="ready-made items" />
      {data && <CardLine left={kinds.map(([k, items]) => `${items.length} ${k}`).join(' · ')} />}
      {data && <CardLine left={`${madeHere} made here`} />}
      <CardLine left="Marketplace" right="Coming soon" />
    </OrgCard>
  )
}

/** The workplace (every screen reviewed spec §3, Organisation), for everyone: a card for each part, with its count and what matters in it now. */
export function WorkplaceSection({ isAdmin }: { isAdmin: boolean }) {
  return (
    <section aria-label="The workplace">
      <OrgGroupHeading title="The workplace" />
      <CardGrid>
        <PeopleCard isAdmin={isAdmin} />
        <AgentsCard />
        <TeamsCard />
        <ProductsCard />
        <ProgramsCard />
        <LibraryCard />
      </CardGrid>
    </section>
  )
}
