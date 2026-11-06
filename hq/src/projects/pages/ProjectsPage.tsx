import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useQuery, getProjects, getUserSettings, getProducts, getPrograms, getExecutionSites, getProjectCards, getBillingProfileChoices } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { NoExecutionSiteNotice, useNoExecutionSite } from '../../shared/components/NoExecutionSiteNotice'
import { NewProjectDialog, type NewProjectSite } from '../screen/NewProjectDialog'
import { ProjectCardsView, type ProjectRow } from '../screen/ProjectCardsView'

type Site = { id: string; siteId: string; label: string; status: string; isDefault: boolean }

/**
 * The Projects page: the projects the person is in, and the open ones they can join, as cards. Boards, Workspaces
 * and Routines across every project are rail places of their own.
 */
export function ProjectsPage() {
  const { data: projectData, isLoading } = useQuery(getProjects)
  const { data: products } = useQuery(getProducts)
  const { data: programs } = useQuery(getPrograms)
  const { data: executionSites } = useQuery(getExecutionSites)
  const { data: billingChoices } = useQuery(getBillingProfileChoices)
  const { data: cardLines } = useQuery(getProjectCards)
  const { data: mySettings } = useQuery(getUserSettings)
  const noSite = useNoExecutionSite()
  const isOrgAdmin = (mySettings as { role?: string } | undefined)?.role === 'ADMIN'
  const [showNew, setShowNew] = useState(false)

  const projects: ProjectRow[] = projectData ?? []
  const lineOf = new Map((cardLines?.cards ?? []).map(c => [c.projectId, c]))
  const sites: NewProjectSite[] = ((executionSites ?? []) as Site[])
    .filter(s => s.status !== 'REVOKED')
    .map(s => ({ siteId: s.siteId, label: s.label, isDefault: s.isDefault }))

  return (
    <AppLayout
      breadcrumbs={[{ label: 'Projects' }]}
      title="Projects"
      subtitle="The projects you are in, and the open ones you can join"
      action={
        <span title={noSite ? 'No Execution Site is connected, so there is nowhere to keep a project.' : undefined}>
          <Button leadingIcon={<Plus size={14} aria-hidden />} disabled={noSite} onClick={() => setShowNew(true)}>New project</Button>
        </span>
      }
    >
      <div className="px-4 lg:px-8 py-6 space-y-6 overflow-y-auto">
        <NoExecutionSiteNotice />
        <ProjectCardsView
          projects={projects}
          products={(products ?? []) as { id: string; name: string }[]}
          programs={(programs ?? []) as { id: string; name: string }[]}
          lineOf={lineOf}
          isLoading={isLoading}
        />
      </div>
      <NewProjectDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        isOrgAdmin={isOrgAdmin}
        sites={sites}
        billingProfiles={billingChoices ?? []}
        existingKeys={projects.map(p => p.key).filter(Boolean)}
      />
    </AppLayout>
  )
}
