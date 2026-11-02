import { useEffect, useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { useQuery, getWorkspace, getWorkspaceBranches } from 'wasp/client/operations'
import type { WorkspaceBranchesView } from '../../branches/views'
import { useWorkspaces } from '../../storage/pages/filesToolData'
import { WorkspaceViewBody } from '../components/WorkspaceViewBody'
import { WorkspaceChangesContext, WorkspaceEventContext, useWorkspaceLive, useOnWorkspaceChange } from '../hooks/useWorkspaceLive'
import { byRecent, noteOpened, recentWorkspaces } from '../viewAddress'

/**
 * A workspace opened full screen (live preview spec, part 1): HQ's navigation is hidden, and *‹ <place>* goes back to
 * the place's Workspaces. The address carries the branch, the section and the file, so a link opens it directly.
 */
export function WorkspaceViewPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  if (!workspaceId) return null
  return <WorkspaceViewScreen key={workspaceId} workspaceId={workspaceId} />
}

export function placeOf(ws: { ownerType: string; ownerKey: string | null; ownerName: string }): { href: string; label: string } {
  if (ws.ownerType === 'project' && ws.ownerKey) return { href: `/projects/${encodeURIComponent(ws.ownerKey)}?tool=workspaces`, label: ws.ownerName }
  return { href: '/space?tool=workspaces', label: 'Your space' }
}

function WorkspaceViewScreen({ workspaceId }: { workspaceId: string }) {
  const { data: me } = useAuth()
  const userId = me?.id ?? null
  const { data: ws, error } = useQuery(getWorkspace, { workspaceId })
  const branches = useQuery(getWorkspaceBranches, { workspaceId }, { enabled: !!ws })
  const { changes, event } = useWorkspaceLive(workspaceId)
  const owner = ws ? { ownerType: ws.ownerType as 'project' | 'user', ownerId: ws.ownerId } : { ownerType: 'user' as const, ownerId: '' }
  const { workspaces } = useWorkspaces(owner)

  useEffect(() => { if (userId) noteOpened(window.localStorage, userId, workspaceId) }, [userId, workspaceId])
  useEffect(() => {
    if (!ws) return
    document.title = ws.name
  }, [ws])
  const switcher = useMemo(
    () => (userId ? byRecent(workspaces ?? [], recentWorkspaces(window.localStorage, userId)) : workspaces ?? []).map(w => ({ id: w.id, name: w.name })),
    [workspaces, userId],
  )

  if (error) return <Plain>{error.message} <Link to="/projects" className="text-accent hover:underline">Projects</Link></Plain>
  if (!ws) return <Plain>Loading…</Plain>
  const view = branches.data as WorkspaceBranchesView | undefined
  if (branches.error) return <Plain>{branches.error.message} <Link to={placeOf(ws).href} className="text-accent hover:underline">Back to {placeOf(ws).label}</Link></Plain>
  if (!view) return <Plain>Loading…</Plain>

  return (
    <WorkspaceChangesContext.Provider value={changes}>
      <WorkspaceEventContext.Provider value={event}>
      <Refetch refetch={branches.refetch} />
      <WorkspaceViewBody
        workspace={{ id: ws.id, name: ws.name, ownerType: owner.ownerType, ownerId: ws.ownerId }}
        view={view} userId={userId} back={placeOf(ws)} workspaces={switcher}
        refetchBranches={() => { void branches.refetch() }}
      />
      </WorkspaceEventContext.Provider>
    </WorkspaceChangesContext.Provider>
  )
}

/** Reads the branch list again on every event from the workspace's room. */
function Refetch({ refetch }: { refetch: () => unknown }) {
  useOnWorkspaceChange(refetch)
  return null
}

function Plain({ children }: { children: ReactNode }) {
  return <p role="status" className="px-6 py-6 text-body text-text-secondary">{children}</p>
}
