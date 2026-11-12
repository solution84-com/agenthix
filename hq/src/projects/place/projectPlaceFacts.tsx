import type { PlaceFact } from '../../places/placeTypes'
import { ChatAgentsFact } from '../../chat/ChatAgentsFact'
import { SiteScheduleFact } from '../../sites/scheduled/SiteScheduleFact'

type FactsSite = { id: string; label: string; warning?: string | null } | null

/** The project's site, and under it the warning when its machine is nearly out of disk or memory. */
function SiteFact({ site, projectKey }: { site: FactsSite; projectKey: string }) {
  if (!site) return <>None</>
  return (
    <>
      {site.label}<SiteScheduleFact projectKey={projectKey} />
      {site.warning && <span role="status" className="mt-0.5 block text-small text-warning">{site.warning}</span>}
    </>
  )
}

/** A project's facts: a personal project's say it is only its person's; a shared one's who leads it and how it is set up. */
export function projectFacts(project: {
  key: string
  personalOwnerId: string | null
  accessLevel: 'OPEN' | 'PRIVATE'
  lead: { username: string } | null
  executionSite: FactsSite
  product: { name: string } | null
}, defaultAgent: string | undefined): PlaceFact[] {
  const site = { label: 'Site', value: <SiteFact site={project.executionSite} projectKey={project.key} /> }
  if (project.personalOwnerId) {
    return [{ label: 'Who sees it', value: 'Only you' }, { label: 'Agents', value: <ChatAgentsFact /> }, site]
  }
  return [
    { label: 'Lead', value: project.lead?.username ?? 'None' },
    site,
    { label: 'Default agent', value: defaultAgent ?? 'None' },
    { label: 'Product', value: project.product?.name ?? 'None' },
    { label: 'Access', value: project.accessLevel === 'PRIVATE' ? 'Private' : 'Open' },
  ]
}
