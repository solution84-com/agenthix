import { useEffect, useMemo, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { useQuery, getWorkspace, getWorkspaceBranches } from 'wasp/client/operations'
import type { WorkspaceBranchesView } from '../../branches/views'
import { useWorkspaces } from '../../storage/pages/filesToolData'
import { AppShell } from '../../shared/layouts/AppShell'
import type { PlaceRef } from '../../dock/startPlace'
import { WorkspaceViewBody } from '../components/WorkspaceViewBody'
import { CantOpenWorkspace, CantReadBranches, isRefused } from '../components/CantOpen'
import { WorkspaceChangesContext, WorkspaceEventContext, useWorkspaceLive, useOnWorkspaceChange } from '../hooks/useWorkspaceLive'
import { useViewSize } from '../hooks/useViewSize'
import { byRecent, noteOpened, recentWorkspaces } from '../viewAddress'

/**
 * A workspace opened in the app's frame (live preview spec, part 1): HQ's rail on the left, without the project's
 * menu; the view's own top bar in place of the screen bar; the app's chat panel on the right; and *‹ <place>* goes
 * back to the place's Workspaces. The address carries the branch, the section, the
 * file and an older version of main, so a link opens it directly. A workspace that cannot be opened gets a page that
 * says why.
 */
export function WorkspaceViewPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  if (!workspaceId) return null
  return <WorkspaceViewScreen key={workspaceId} workspaceId={workspaceId} />
}

/** Asking again cannot open a workspace that is not there or not the person's: only other failures are tried again. */
const retryUnlessRefused = (failures: number, error: unknown) => !isRefused(error) && failures < 3

export function chatPlaceOf(ws: { ownerType: string; ownerKey: string | null }): PlaceRef {
  return ws.ownerType === 'project' && ws.ownerKey ? { kind: 'project', key: ws.ownerKey } : { kind: 'space' }
}

export function placeOf(ws: { ownerType: string; ownerKey: string | null; ownerName: string }): { href: string; label: string } {
  if (ws.ownerType === 'project' && ws.ownerKey) return { href: `/projects/${encodeURIComponent(ws.ownerKey)}?tool=workspaces`, label: ws.ownerName }
  return { href: '/space?tool=workspaces', label: 'Your space' }
}

function WorkspaceViewScreen({ workspaceId }: { workspaceId: string }) {
  const { data: me } = useAuth()
  const userId = me?.id ?? null
  const { data: ws, error } = useQuery(getWorkspace, { workspaceId }, { retry: retryUnlessRefused })
  const branches = useQuery(getWorkspaceBranches, { workspaceId }, { enabled: !!ws })
  const { changes, event } = useWorkspaceLive(workspaceId)
  const owner = ws ? { ownerType: ws.ownerType as 'project' | 'user', ownerId: ws.ownerId } : { ownerType: 'user' as const, ownerId: '' }
  const { workspaces } = useWorkspaces(owner)

  useEffect(() => { if (userId) noteOpened(window.localStorage, userId, workspaceId) }, [userId, workspaceId])
  const place = useMemo(() => (ws ? chatPlaceOf(ws) : null), [ws])
  const switcher = useMemo(
    () => (userId ? byRecent(workspaces ?? [], recentWorkspaces(window.localStorage, userId)) : workspaces ?? []).map(w => ({ id: w.id, name: w.name })),
    [workspaces, userId],
  )

  // The view's top bar stands in for the screen bar, and a phone's frame has its own header; the tab's title is the workspace's.
  const phone = useViewSize() === 'phone'
  const shell = (children: ReactNode) => (
    <AppShell ownBar mobileHeader={phone ? <></> : undefined} breadcrumbs={ws ? [{ label: ws.name }] : []}>{children}</AppShell>
  )
  if (error) return shell(<CantOpenWorkspace workspaceId={workspaceId} />)
  if (!ws || !place) return shell(<Plain>Loading…</Plain>)
  const view = branches.data as WorkspaceBranchesView | undefined
  if (branches.error) return shell(<CantReadBranches message={branches.error.message} back={placeOf(ws)} />)
  if (!view) return shell(<Plain>Loading…</Plain>)

  return shell(
    <WorkspaceChangesContext.Provider value={changes}>
      <WorkspaceEventContext.Provider value={event}>
      <Refetch refetch={branches.refetch} />
      <WorkspaceViewBody
        workspace={{ id: ws.id, name: ws.name, ownerType: owner.ownerType, ownerId: ws.ownerId }}
        view={view} userId={userId} back={placeOf(ws)} place={place} workspaces={switcher}
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
