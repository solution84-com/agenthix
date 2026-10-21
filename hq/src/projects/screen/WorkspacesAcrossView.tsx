import { useState } from 'react'
import { Link } from 'react-router'
import { FolderGit2 } from 'lucide-react'
import { useQuery, getWorkspacesAcrossPlaces } from 'wasp/client/operations'
import { FilterSelect, PlaceAvatar } from '@agenthix/ui/primitives'
import { EmptyState } from '../../shared/components/ui/EmptyState'
import { repoName } from '../../storage/pages/BackupLine'
import { SilentSitesLine } from '../../storage/pages/SilentSitesLine'
import type { WorkspacesAcrossPlaces } from '../../storage/workspacesAcrossPlaces'
import { workspaceAddress } from '../placeAddresses'
import { visibleWorkspaces, type WorkspaceRowData } from './acrossLists'
import { ProjectsControls } from './ProjectsControls'
import { CHAT_PLACE, useProjectsScreenUrl } from './projectsScreenUrl'

const GRID = 'md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)] md:items-center md:gap-4'

function WorkspaceRow({ w }: { w: WorkspaceRowData }) {
  const repository = w.repoUrl ? repoName(w.repoUrl) : 'No repository'
  return (
    <li>
      <Link to={workspaceAddress(w.place, w.id)} className={`block min-w-0 border-b border-border-subtle px-1 py-2.5 hover:bg-surface-hover ${GRID}`}>
        <b className="block truncate text-body font-semibold text-text-primary">{w.name}</b>
        <span className="flex min-w-0 items-center gap-2 text-small text-text-secondary">
          <PlaceAvatar kind="project" id={w.place.ownerId} name={w.place.name} size="xs" />
          <span className="truncate">{w.place.name}</span>
          <span className="truncate font-mono text-micro text-text-muted md:hidden">· {repository}</span>
        </span>
        <span className="hidden truncate font-mono text-small text-text-muted md:block">{repository}</span>
        <span className="block truncate text-small md:text-small">
          {w.previewRunning
            ? <span className="inline-flex items-center gap-1 text-success"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />Preview running</span>
            : <span className="text-text-muted">Not running</span>}
          <span className="text-text-muted md:hidden">{w.siteLabel ? ` · ${w.siteLabel}` : ''}</span>
        </span>
        <span className="hidden truncate text-small text-text-muted md:block">{w.siteLabel ?? '—'}</span>
      </Link>
    </li>
  )
}

/** Every workspace in the person's projects and in their own Chat, each opening in its place's Workspaces tool. */
export function WorkspacesAcrossView() {
  const { screen, filter } = useProjectsScreenUrl()
  const { data, isLoading } = useQuery(getWorkspacesAcrossPlaces)
  const [search, setSearch] = useState('')
  const view = data as WorkspacesAcrossPlaces | undefined
  const all = (view?.workspaces ?? []) as WorkspaceRowData[]
  const shown = visibleWorkspaces(all, { place: screen.place, search })
  const unanswered = view?.unanswered ?? []

  return (
    <>
      <ProjectsControls search={search} onSearch={setSearch} searchLabel="Search workspaces">
        {view && view.places.length > 0 && (
          <FilterSelect label="Place" value={screen.place ?? ''} onChange={v => filter({ place: v || null })}>
            <option value="">All places</option>
            {view.places.map(p => <option key={p.ownerId} value={p.key ?? CHAT_PLACE}>{p.name}</option>)}
          </FilterSelect>
        )}
      </ProjectsControls>
      {isLoading && !view ? (
        <p className="text-body text-text-muted">Loading…</p>
      ) : shown.length === 0 ? (
        // "None yet" is only true when every site answered; a silent site may hold some.
        unanswered.length === 0 && (
          <EmptyState
            icon={FolderGit2}
            title={all.length === 0 ? 'No workspaces yet' : 'No workspaces match'}
            hint={all.length === 0 ? 'New workspace… makes one in a project or in Chat' : undefined}
          />
        )
      ) : (
        <div>
          <div className={`hidden border-b border-border-subtle px-1 pb-1.5 text-micro font-medium uppercase tracking-wide text-text-muted ${GRID}`}>
            <span>Workspace</span><span>Place</span><span>Repository</span><span>Preview</span><span>Site</span>
          </div>
          <ul>{shown.map(w => <WorkspaceRow key={w.id} w={w} />)}</ul>
        </div>
      )}
      <SilentSitesLine unanswered={unanswered} className="py-2" />
    </>
  )
}
