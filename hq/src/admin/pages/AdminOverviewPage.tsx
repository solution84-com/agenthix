import { useQuery, getWorkplacePeople, getOrgAgents, getProjects } from 'wasp/client/operations'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { NeedsAttentionSection } from '../../org/components/NeedsAttentionSection'
import { TodaySection } from '../../org/components/TodaySection'
import { BigNumber, CardGrid, OrgCard, OrgGroupHeading } from '../../org/components/orgCardParts'

/** People, agents and projects, each opening where it is managed; the runs so far today are in Today, below. */
function Figures() {
  const { data: people } = useQuery(getWorkplacePeople)
  const { data: agents } = useQuery(getOrgAgents)
  const { data: projects } = useQuery(getProjects)
  const count = (n: number | undefined, one: string, many: string) => ({ value: n ?? '–', label: n === 1 ? one : many })
  const person = count(people?.count, 'person', 'people')
  const agent = count(agents?.agents.length, 'agent', 'agents')
  const project = count(projects?.length, 'project', 'projects')
  return (
    <section aria-label="The organisation">
      <OrgGroupHeading title="The organisation" />
      <CardGrid columns="lg:grid-cols-3">
        <OrgCard title="People" to="/admin/people"><BigNumber {...person} /></OrgCard>
        <OrgCard title="Agents" to="/admin/agents"><BigNumber {...agent} /></OrgCard>
        <OrgCard title="Projects" to="/projects"><BigNumber {...project} /></OrgCard>
      </CardGrid>
    </section>
  )
}

/** The admin area's first screen: what needs an admin, then today's figures. */
export function AdminOverviewPage() {
  return (
    <AppLayout breadcrumbs={[{ label: 'Manage organisation' }, { label: 'Overview' }]}>
      <div className="space-y-2 px-4 pb-12 pt-6 lg:px-10">
        <NeedsAttentionSection />
        <Figures />
        <TodaySection />
      </div>
    </AppLayout>
  )
}
