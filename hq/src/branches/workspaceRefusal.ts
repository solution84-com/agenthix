/**
 * Why a workspace cannot be opened, for the page the workspace view shows instead of loading for ever. It names the
 * workspace's project only to a person who may see that the project exists (a member, or anyone for an open one);
 * nothing of the workspace itself is told.
 */
import { HttpError, prisma } from 'wasp/server'
import { assertLocationAccess } from '../storage/locationAccess'
import { isProjectVisibleTo } from '../projects/membership'
import { rethrowSiteUnreachableAsHttp } from '../storage/httpErrors'
import { locateWorkspace, type LocatedWorkspace } from './workspaceLocation'
import { requireUser } from './workspaceAccess'
import type { WorkspaceRefusalView } from './views'

type Ctx = { user?: { id: string } | null }

const isRefusal = (err: unknown, code: number) => err instanceof HttpError && err.statusCode === code

export async function getWorkspaceRefusal(args: { workspaceId: string }, context: Ctx): Promise<WorkspaceRefusalView> {
  const userId = requireUser(context)
  const workspaceId = args?.workspaceId
  if (typeof workspaceId !== 'string' || workspaceId.length === 0 || workspaceId.length > 200) return { reason: 'gone' }
  let found: LocatedWorkspace | null
  try {
    found = await locateWorkspace(workspaceId)
  } catch (err) {
    rethrowSiteUnreachableAsHttp(err)
  }
  if (!found) return { reason: 'gone' }
  try {
    await assertLocationAccess(found.ref, userId, 'read')
    return { reason: 'open' }
  } catch (err) {
    if (isRefusal(err, 404)) return { reason: 'gone' }
    if (!isRefusal(err, 403)) throw err
  }
  if (found.ref.ownerType !== 'project' || !(await isProjectVisibleTo(found.ref.ownerId, userId))) return { reason: 'no_access', project: null }
  const project = await prisma.project.findUnique({ where: { id: found.ref.ownerId }, select: { name: true, key: true } })
  return { reason: 'no_access', project: project ? { name: project.name, key: project.key } : null }
}
