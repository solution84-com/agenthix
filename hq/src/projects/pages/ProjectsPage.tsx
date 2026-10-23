import { useState } from 'react'
import { useQuery, createProject, getProjects, getUserSettings, getProducts, getPrograms, getExecutionSites, getProjectCards, getWorkspacesAcrossPlaces } from 'wasp/client/operations'
import { CreateProjectModal } from '@agenthix/ui/projects'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { NoExecutionSiteNotice, useNoExecutionSite } from '../../shared/components/NoExecutionSiteNotice'
import type { WorkspacesAcrossPlaces } from '../../storage/workspacesAcrossPlaces'
import { BoardsAcrossView } from '../screen/BoardsAcrossView'
import { NewIntoPlace, type NewPlace } from '../screen/NewIntoPlace'
import { NewProjectDialog } from '../screen/NewProjectDialog'
import { NewProjectMenu } from '../screen/NewProjectMenu'
import { ProjectCardsView, type ProjectRow } from '../screen/ProjectCardsView'
import { RoutinesAcrossView } from '../screen/RoutinesAcrossView'
import { WorkspacesAcrossView } from '../screen/WorkspacesAcrossView'
import { CHAT_PLACE, VIEW_LABEL, useProjectsScreenUrl } from '../screen/projectsScreenUrl'

type Site = { id: string; siteId: string; label: string; status: string; isDefault: boolean }

/** Where a board or routine may be added: the projects the person works in, their own Chat among them (a Viewer adds nothing). */
function boardPlaces(projects: ProjectRow[]): NewPlace[] {
  return projects.filter(p => p.isMember && p.myRole !== 'VIEWER').map(p => p.personalSpace
    ? { id: p.id, value: CHAT_PLACE, name: 'Chat', key: null, siteLabel: null }
    : { id: p.id, value: p.key, name: p.name, key: p.key, siteLabel: null })
}

function workspacePlaces(across: WorkspacesAcrossPlaces | undefined, projects: ProjectRow[], sites: Site[]): NewPlace[] {
  const labelOf = (id: string | null | undefined) => sites.find(s => s.id === id)?.label ?? null
  const defaultLabel = sites.find(s => s.isDefault && s.status !== 'REVOKED')?.label ?? null
  return (across?.places ?? []).filter(p => p.mayAdd).map(p => ({
    id: p.ownerId,
    value: p.key ?? CHAT_PLACE,
    name: p.name,
    key: p.key,
    siteLabel: p.key ? labelOf(projects.find(pr => pr.id === p.ownerId)?.executionSiteId) : defaultLabel,
  }))
}

/**
 * The Projects screen (every screen reviewed spec §3): the projects as cards, and every board, workspace and routine
 * in the person's projects as three more views. The header and its ＋ New project ▾ are the same on all four.
 */
export function ProjectsPage() {
  const { data: projectData, isLoading, refetch } = useQuery(getProjects)
  const { data: products } = useQuery(getProducts)
  const { data: programs } = useQuery(getPrograms)
  const { data: executionSites } = useQuery(getExecutionSites)
  const { data: cardLines } = useQuery(getProjectCards)
  const { screen, startCreating } = useProjectsScreenUrl()
  const across = useQuery(getWorkspacesAcrossPlaces, undefined, { enabled: screen.creating === 'workspace' })
  const noSite = useNoExecutionSite()
  const { data: mySettings } = useQuery(getUserSettings)
  const isOrgAdmin = (mySettings as { role?: string } | undefined)?.role === 'ADMIN'
  const [showNew, setShowNew] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const projects: ProjectRow[] = projectData ?? []
  const sites = (executionSites ?? []) as Site[]
  const lineOf = new Map((cardLines?.cards ?? []).map(c => [c.projectId, c]))

  // SiteSelector's status vocabulary predates the registry: REGISTERED means
  // "known to hq, not yet connected", which is what PENDING renders.
  const siteOptions = sites
    .filter(s => s.status !== 'REVOKED')
    .map(s => ({ siteId: s.siteId, name: s.label, status: s.status === 'REGISTERED' ? 'PENDING' : s.status }))

  const creating = screen.creating
  const crumbs = creating
    ? [{ label: 'Projects', href: '/projects' }, { label: `New ${creating}` }]
    : [{ label: 'Projects' }, ...(screen.view === 'projects' ? [] : [{ label: VIEW_LABEL[screen.view] }])]

  return (
    <AppLayout
      breadcrumbs={crumbs}
      title="Projects"
      subtitle="Your projects, and their boards, workspaces and routines"
      action={
        <NewProjectMenu
          noSite={noSite}
          onNewProject={() => setShowNew(true)}
          onNewBoard={() => startCreating('board')}
          onNewWorkspace={() => startCreating('workspace')}
          onNewRoutine={() => startCreating('routine')}
        />
      }
    >
      <div className="px-4 lg:px-8 py-6 space-y-6 overflow-y-auto">
        <NoExecutionSiteNotice />
        {creating === 'board' || creating === 'routine' ? (
          <NewIntoPlace what={creating} places={boardPlaces(projects)} />
        ) : creating === 'workspace' ? (
          across.data
            ? <NewIntoPlace what="workspace" places={workspacePlaces(across.data as WorkspacesAcrossPlaces, projects, sites)} />
            : <p className="text-body text-text-muted">Loading…</p>
        ) : screen.view === 'boards' ? (
          <BoardsAcrossView />
        ) : screen.view === 'workspaces' ? (
          <WorkspacesAcrossView />
        ) : screen.view === 'routines' ? (
          <RoutinesAcrossView />
        ) : (
          <ProjectCardsView
            projects={projects}
            products={(products ?? []) as { id: string; name: string }[]}
            programs={(programs ?? []) as { id: string; name: string }[]}
            lineOf={lineOf}
            isLoading={isLoading}
          />
        )}
      </div>

      <NewProjectDialog
        open={showNew}
        isOrgAdmin={isOrgAdmin}
        onClose={() => setShowNew(false)}
        onOrganisationProject={() => setShowCreate(true)}
      />
      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        sites={siteOptions}
        defaultSelectedSiteId={sites.find(s => s.isDefault && s.status !== 'REVOKED')?.siteId}
        products={((products ?? []) as { id: string; name: string }[]).map(p => ({ id: p.id, name: p.name }))}
        programs={((programs ?? []) as { id: string; name: string }[]).map(p => ({ id: p.id, name: p.name }))}
        existingKeys={projects.map(p => p.key).filter(Boolean)}
        actions={{
          createProject: async (input) => {
            const result = await createProject(input)
            return { id: result.id }
          },
        }}
        onCreated={() => refetch()}
      />
    </AppLayout>
  )
}
