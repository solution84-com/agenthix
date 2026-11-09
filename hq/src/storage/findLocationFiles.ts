/**
 * Search files in a Files tool or a workspace (S5): every file of the location whose name holds what the person
 * typed, at any depth, found by the location's site (`location.findFiles`, the walk the message box's `@` picker uses).
 * Read-only: nothing is signed or recorded, and it answers while hq is read-only.
 *
 * The person's access to the location is checked before its site is asked, as listing a folder checks it: the order
 * is the security property, since the site holds no identity store (adr-0042). Containment is the site's.
 */
import { HttpError } from 'wasp/server'
import {
  FIND_FILES_MAX_FRAGMENT, LOCATION_FILE_METHODS, isLocationRef,
  type LocationFindFilesResult, type LocationRef,
} from '@agenthix/core'
import { assertLocationAccess } from './locationAccess'
import { resolveStorageSite } from './storageSite'
import { siteChannelRegistry } from '../sites/channel'
import { rethrowLocationFileErrorAsHttp } from './httpErrors'

/** A person is typing, and a site this slow is as good as away. The site's own walk stops well before. */
export const FIND_LOCATION_FILES_TIMEOUT_MS = 5_000

export type FoundLocationFile = { path: string; name: string; folder: string; size: number; modifiedAt: string }
export type FindLocationFilesResult = { files: FoundLocationFile[]; truncated: boolean }

export interface FindLocationFilesDeps {
  /** Throws when the person may not read the location. */
  checkAccess(loc: LocationRef, userId: string): Promise<void>
  /** Throws when the site can't be reached or doesn't answer. */
  find(loc: LocationRef, fragment: string): Promise<LocationFindFilesResult>
}

export async function findLocationFiles(
  loc: LocationRef, fragment: string, userId: string, deps: FindLocationFilesDeps,
): Promise<FindLocationFilesResult> {
  await deps.checkAccess(loc, userId)
  const result = await deps.find(loc, fragment)
  return {
    files: result.files.map(f => ({ path: f.path, name: f.name, folder: f.folder, size: f.size, modifiedAt: f.modifiedAt })),
    truncated: result.truncated,
  }
}

export const findLocationFilesDeps: FindLocationFilesDeps = {
  checkAccess: (loc, userId) => assertLocationAccess(loc, userId, 'read'),
  async find(loc, fragment) {
    const siteId = await resolveStorageSite(loc)
    return siteChannelRegistry.request(siteId, LOCATION_FILE_METHODS.findFiles, { loc, fragment }, FIND_LOCATION_FILES_TIMEOUT_MS)
  },
}

type Ctx = { user?: { id: string } | null }
export type FindLocationFilesArgs = { target: LocationRef; fragment: string }

export const findLocationFilesQuery = async (args: FindLocationFilesArgs, context: Ctx): Promise<FindLocationFilesResult> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const target = args?.target
  const fragment = typeof args?.fragment === 'string' ? args.fragment.trim() : null
  if (!isLocationRef(target)) throw new HttpError(400, 'Say which files to search. Nothing was changed.')
  if (!fragment || fragment.length > FIND_FILES_MAX_FRAGMENT) {
    throw new HttpError(400, `A file is found by 1 to ${FIND_FILES_MAX_FRAGMENT} characters of its name. Nothing was changed.`)
  }
  const loc: LocationRef = {
    ownerType: target.ownerType, ownerId: target.ownerId, workspaceId: target.workspaceId ?? null, taskId: target.taskId ?? null,
  }
  try {
    return await findLocationFiles(loc, fragment, context.user.id, findLocationFilesDeps)
  } catch (err) {
    if (err instanceof HttpError) throw err
    rethrowLocationFileErrorAsHttp(err)
  }
}
