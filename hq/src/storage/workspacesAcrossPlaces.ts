/**
 * Every workspace in the places a person may reach, for the Projects screen's Workspaces view (every screen
 * reviewed spec §3): one row per workspace with its place, repository, site and whether a live preview of
 * it (on any branch, or `main`) is running.
 * The listing is `getMyStorage`'s, so who may see what is as it was; a site that does not answer is named beside
 * the rows, never mistaken for an empty place.
 */
import { HttpError, prisma } from 'wasp/server'
import type { SiteSilence } from '@agenthix/core'
import { getMyStorageQuery } from './queries'
import { isOrgFeatureOn } from '../features/switches'

export type WorkspaceAcrossPlaces = {
  id: string
  name: string
  repoUrl: string | null
  siteLabel: string | null
  previewRunning: boolean
  place: { ownerType: 'project' | 'user'; ownerId: string; key: string | null; name: string }
}

export type PlaceOption = { ownerType: 'project' | 'user'; ownerId: string; key: string | null; name: string; mayAdd: boolean }

export type WorkspacesAcrossPlaces = { workspaces: WorkspaceAcrossPlaces[]; places: PlaceOption[]; unanswered: SiteSilence[] }

export const getWorkspacesAcrossPlacesQuery = async (_args: unknown, context: { user?: { id: string } }): Promise<WorkspacesAcrossPlaces> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const me = context.user.id
  const { groups, unanswered } = await getMyStorageQuery(undefined, context)
  const roles = await prisma.projectMember.findMany({ where: { userId: me }, select: { projectId: true, role: true } })
  // Adding a workspace is working in the place (adr-0102): a Viewer reads and adds nothing.
  const mayWork = new Set(roles.filter(r => r.role !== 'VIEWER').map(r => r.projectId))
  const ids = groups.flatMap(g => g.workspaces.map(w => w.id))
  // A workspace is marked as having a live preview running only while the live preview's flag is on (adr-0172).
  const previews = (await isOrgFeatureOn('livePreview'))
    ? await prisma.livePreview.findMany({ where: { workspaceId: { in: ids }, state: 'RUNNING' }, select: { workspaceId: true } })
    : []
  const running = new Set(previews.map(p => p.workspaceId))

  const places: PlaceOption[] = groups.map(g => ({
    ownerType: g.ownerType, ownerId: g.ownerId, key: g.place?.key ?? null, name: g.place?.name ?? 'Chat',
    mayAdd: g.ownerType === 'user' || mayWork.has(g.ownerId),
  }))
  const workspaces = groups.flatMap(g => g.workspaces.map((w): WorkspaceAcrossPlaces => ({
    id: w.id, name: w.name, repoUrl: w.repoUrl, siteLabel: w.siteLabel, previewRunning: running.has(w.id),
    place: { ownerType: g.ownerType, ownerId: g.ownerId, key: g.place?.key ?? null, name: g.place?.name ?? 'Chat' },
  })))
  return { workspaces, places, unanswered }
}
