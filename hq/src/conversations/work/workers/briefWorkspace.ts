/**
 * The workspace a lead's brief names for its work in one place (start_work's `workspace`): any conversation may ask
 * for a change to a workspace its place holds, and the work runs there, on the conversation's own branch when the
 * workspace has Git (`branches/runCodeWork.ts`). Admitted only when the workspace is that place's own and the person
 * may work in it, as things stand at the call; a refusal is the lead's words about the person it talks to.
 */
import { HttpError } from 'wasp/server'
import { locateWorkspace } from '../../../branches/workspaceLocation'
import { reachWorkspace } from '../../../branches/workspaceAccess'
import { SiteUnreachableError } from '../../../storage/workspaceStore'
import type { SharedBoundary } from '../../contract'

const placeName = (b: Pick<SharedBoundary, 'type' | 'name'>) => (b.type === 'user' ? 'your space' : b.name)

export async function workspaceForBrief(
  personId: string, boundary: Pick<SharedBoundary, 'type' | 'id' | 'name'>, workspaceId: string,
): Promise<{ workspaceId: string } | { refusal: string }> {
  const unreachable = { refusal: `the site that holds the workspaces of ${placeName(boundary)} can't be reached right now` }
  const notHere = {
    refusal: `there is no workspace with the id "${workspaceId}" in ${placeName(boundary)}; pass the id of one listed for it in this tool's description`,
  }
  let found
  try {
    found = await locateWorkspace(workspaceId)
  } catch (err) {
    if (err instanceof SiteUnreachableError) return unreachable
    throw err
  }
  if (!found || found.ref.ownerType !== boundary.type || found.ref.ownerId !== boundary.id) return notHere
  try {
    // Changing a workspace is working in it: a project's Viewer reads it and changes nothing.
    await reachWorkspace(found.ref.workspaceId, personId, 'work')
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 403) return { refusal: `you can only read ${found.name}, not change it` }
    if (err instanceof HttpError && err.statusCode === 404) return notHere
    if (err instanceof HttpError && err.statusCode === 503) return unreachable
    throw err
  }
  return { workspaceId: found.ref.workspaceId }
}
