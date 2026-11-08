import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { useQuery, getProjects, getExecutionSites, getWorkspacesAcrossPlaces } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { AppLayout } from '../../shared/layouts/AppLayout'
import { NoExecutionSiteNotice, useNoExecutionSite } from '../../shared/components/NoExecutionSiteNotice'
import type { WorkspacesAcrossPlaces } from '../../storage/workspacesAcrossPlaces'
import { NewIntoPlace } from './NewIntoPlace'
import { boardPlaces, workspacePlaces, type PlaceProject, type PlaceSite } from './newPlaces'
import { useAcrossListUrl, type Creating } from './acrossListUrl'

/** The places a new board, workspace or routine may go in; loaded only while one is being made. */
function NewHere({ what }: { what: Creating }) {
  const projects = useQuery(getProjects)
  const sites = useQuery(getExecutionSites, undefined, { enabled: what === 'workspace' })
  const across = useQuery(getWorkspacesAcrossPlaces, undefined, { enabled: what === 'workspace' })
  const rows = (projects.data ?? []) as PlaceProject[]
  if (!projects.data || (what === 'workspace' && (!across.data || !sites.data))) return <p className="text-body text-text-muted">Loading…</p>
  const places = what === 'workspace'
    ? workspacePlaces(across.data as WorkspacesAcrossPlaces, rows, (sites.data ?? []) as PlaceSite[])
    : boardPlaces(rows)
  return <NewIntoPlace what={what} places={places} />
}

/**
 * A rail place listing one kind of thing across every project and Chat — Boards, Workspaces, Routines: its own
 * title and subtitle, and its one *New …* button, which asks for the place first and then the tool's own form.
 */
export function AcrossListPage({ what, title, subtitle, children }: {
  what: Creating
  title: string
  subtitle: string
  children: ReactNode
}) {
  const { screen, startCreating } = useAcrossListUrl()
  const noSite = useNoExecutionSite()
  const creating = screen.creating === what
  // A workspace is bytes on a site: with none, there is nowhere to make one.
  const refused = what === 'workspace' && noSite
  const refusedWhy = refused ? 'No Execution Site is connected, so there is nowhere to keep a workspace.' : undefined
  return (
    <AppLayout
      screenBarEdge
      breadcrumbs={creating ? [{ label: title, href: `/${title.toLowerCase()}` }, { label: `New ${what}` }] : [{ label: title }]}
      title={title}
      subtitle={subtitle}
      action={!creating && (
        <span title={refusedWhy}>
          <Button leadingIcon={<Plus size={14} aria-hidden />} disabled={refused} onClick={() => startCreating(what)}>New {what}</Button>
        </span>
      )}
      // On a phone the one New is the top bar's ⋯'s first item, not a button in the content.
      phoneActions={creating ? undefined : [{ label: `New ${what}`, onSelect: () => startCreating(what), disabledWhy: refusedWhy }]}
    >
      <div className="space-y-6 overflow-y-auto px-4 py-6 lg:px-6">
        <NoExecutionSiteNotice />
        {creating ? <NewHere what={what} /> : children}
      </div>
    </AppLayout>
  )
}
