/**
 * A workspace's, or a place's `files/`, git status at a glance (spec part 4, R6): read from the site that holds it
 * when the workspace or the Files tool opens and again on focus, never pushed. It changes nothing, here or on the
 * site. A site that does not answer is the folder's own message to give; this query fails and the line hides.
 */
import { HttpError } from 'wasp/server'
import {
  GIT_STATUS_METHOD,
  GIT_STATUS_TIMEOUT_MS,
  type GitStatusResult,
  type LocationRef,
} from '@agenthix/core'
import { siteChannelRegistry } from '../sites/channel'
import { assertLocationAccess } from './locationAccess'
import { resolveStorageSite } from './storageSite'
import { translateFailure } from './repoWorkStore'
import { rethrowRepoWorkErrorAsHttp } from './httpErrors'

type Ctx = { user?: { id: string } }

export async function gitStatusOnSite(logicalSiteId: string, loc: LocationRef): Promise<GitStatusResult> {
  const sent = { loc: { ownerType: loc.ownerType, ownerId: loc.ownerId, workspaceId: loc.workspaceId ?? null, taskId: null } }
  try {
    return await siteChannelRegistry.request(logicalSiteId, GIT_STATUS_METHOD, sent, GIT_STATUS_TIMEOUT_MS)
  } catch (err) {
    return translateFailure(logicalSiteId, GIT_STATUS_METHOD, err)
  }
}

export const getGitStatusQuery = async ({ target }: { target: LocationRef }, context: Ctx): Promise<GitStatusResult> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const loc: LocationRef = { ownerType: target.ownerType, ownerId: target.ownerId, workspaceId: target.workspaceId ?? null, taskId: null }
  await assertLocationAccess(loc, context.user.id, 'read')
  try {
    return await gitStatusOnSite(await resolveStorageSite(loc), loc)
  } catch (err) {
    rethrowRepoWorkErrorAsHttp(err)
  }
}
