import { AppLayout } from '../../shared/layouts/AppLayout'
import { OrgKnowledgeTool } from '../components/OrgKnowledgeTool'

/**
 * Organisation knowledge: the organisation's own pages, read by every member and every agent, changed by the
 * organisation's admins (or an agent they ask). It is the Knowledge tool, with the organisation as its place.
 */
export function OrgKnowledgePage() {
  return (
    <AppLayout
      breadcrumbs={[{ label: 'Organisation', href: '/org' }, { label: 'Knowledge' }]}
      title="Knowledge"
      subtitle="How the whole organisation works. Every agent can look things up here, in every project; organisation admins change it, or ask an agent to"
    >
      <OrgKnowledgeTool />
    </AppLayout>
  )
}
