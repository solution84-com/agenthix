/**
 * `location.remove`: delete a location's directory from this site's disk.
 *
 * Beside `ensureDir` in what it does for a location's life — that creates the
 * directory, this ends it — and split out of `locationFileMethods.ts` so that
 * file stays under the size limit. It shares that file's containment helpers.
 *
 * ## Why this can be trusted to delete
 *
 * A recursive delete is the one operation here that cannot be undone, so it is
 * stricter than the rest of the module in three ways.
 *
 * - **Ids are checked at the wire.** An id must start with a letter, digit or
 *   underscore and contain no separator, so `.` and `..` can never be a storage
 *   id. `assertSafeId` lets a bare `.` through, and `projects/.` is the whole
 *   `projects/` directory — every project's storage.
 * - **The target is contained to the storage root, symlinks resolved.** A
 *   target whose real path lands outside the root is refused, not unlinked.
 * - **Depth is checked as well.** The target must sit at least two segments
 *   below the root for an owner and three for a location, so no reading of a
 *   path can name the root or a whole owner-kind directory. Redundant with the
 *   id rule by design: this is the guard whose failure is a lost disk.
 *
 * - **The walk never follows a link, and never trusts a path twice.** Agents
 *   can write inside a location, so one can swap a directory for a link while
 *   the delete is under way. Each directory is opened once, without following
 *   a link, and confirmed to be the directory the check approved; a link is
 *   only ever unlinked itself. On Linux (the site's image) every entry is then
 *   removed through that open directory (`/proc/self/fd/<fd>/<name>`, see
 *   `descriptorPath`), so a swap anywhere above it cannot redirect the removal.
 *   Elsewhere (macOS, development only) the directory is re-confirmed before
 *   each entry; a swap made and undone between that check and the removal of
 *   one entry is the residual there. `fs.rm` is not used: it walks by path.
 *
 * Idempotent: a directory that is already gone answers `{ removed: false }`.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  LOCATION_FILE_METHODS,
  LocationFileError,
  WORKSPACE_OWNER_TYPES,
  type Exact,
  type LocationRemoveParams,
  type LocationRemoveResult,
} from '@agenthix/core'
import {
  DESCRIPTOR_PATHS_PINNED,
  confirmDescriptor,
  descriptorPath,
  openResolved,
  resolveContained,
} from '../../agents/runtime/containedFile'
import { describeLocation, locationFileError, parseParams, refuse } from './locationContainment'
import { getStorageRoot, locationDir, ownerDir, type LocationRef } from './paths'

const METHOD = LOCATION_FILE_METHODS.removeLocation

/** No leading dot, no separator: `.`, `..` and anything path-shaped are not ids. */
const SAFE_ID = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/
const idSchema = z.string().regex(SAFE_ID)

const removeLocRefSchema = z
  .object({
    ownerType: z.enum(WORKSPACE_OWNER_TYPES),
    ownerId: idSchema,
    workspaceId: idSchema.nullish(),
    taskId: idSchema.nullish(),
  })

/** Exported so the "no caller" property is a test the wire can fail, like the other shapes. */
export const REMOVE_LOCATION_PARAMS_SHAPE = { loc: removeLocRefSchema, wholeOwner: z.literal(true).optional() }
const removeLocationParams = z.object(REMOVE_LOCATION_PARAMS_SHAPE)

const _wireMirrorsCore: [Exact<z.infer<typeof removeLocationParams>, LocationRemoveParams>] = [true]
void _wireMirrorsCore

const OUTSIDE = 'the path is outside the storage root'

/** The directory to delete, or a refusal that names the location and nothing on disk. */
function targetFor(loc: LocationRef, wholeOwner: boolean): string {
  try {
    return wholeOwner ? ownerDir(loc.ownerType, loc.ownerId) : locationDir(loc)
  } catch {
    throw locationFileError('outside', METHOD, loc)
  }
}

export async function removeLocation(params: unknown): Promise<LocationRemoveResult> {
  const { loc, wholeOwner } = parseParams(removeLocationParams, params, METHOD)
  if (wholeOwner && (loc.workspaceId || loc.taskId)) {
    throw new LocationFileError(
      'invalid',
      `${METHOD} with wholeOwner needs the owner alone, but was given ${describeLocation(loc)}`,
    )
  }

  const root = getStorageRoot()
  const target = targetFor(loc, !!wholeOwner)
  const depth = path.relative(root, target).split(path.sep).filter(Boolean).length
  if (depth < (wholeOwner ? 2 : 3)) throw locationFileError('outside', METHOD, loc)

  try {
    const { realRoot, realTarget } = await resolveContained(root, target, OUTSIDE)
    const top = await fs.lstat(target).catch(err => {
      if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null
      throw err
    })
    if (!top) return { removed: false }
    // The location's own directory is site-made, so a link standing there is
    // removed as a link: its target was contained above, and is not ours to empty.
    if (!top.isDirectory()) {
      await fs.unlink(target)
      return { removed: true }
    }
    // A link above the location's own directory (`workspaces/` replaced by
    // one) would make this some other directory under the storage root.
    if (!wholeOwner) {
      const home = ownerDir(loc.ownerType, loc.ownerId)
      if (realTarget !== path.join(await fs.realpath(home), path.relative(home, target))) throw locationFileError('outside', METHOD, loc)
    }
    await removeTree(realRoot, realTarget)
    await fs.rmdir(realTarget)
    return { removed: true }
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return { removed: false }
    if (typeof (err as NodeJS.ErrnoException | null)?.code === 'string') refuse(err, METHOD, loc)
    // The helper's own message is discarded rather than wrapped: it can name the root.
    throw locationFileError('outside', METHOD, loc)
  }
}

const ignoreMissing = (err: unknown) => {
  if ((err as NodeJS.ErrnoException | null)?.code !== 'ENOENT') throw err
}

/** Empties `dirReal` (a real, contained directory path), leaving it in place. */
async function removeTree(realRoot: string, dirReal: string): Promise<void> {
  const handle = await openResolved({ realRoot, realTarget: dirReal }, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY, OUTSIDE)
  try {
    const dir = descriptorPath(handle, dirReal)
    for (const name of await fs.readdir(dir)) {
      if (!DESCRIPTOR_PATHS_PINNED) await confirmDescriptor(handle, realRoot, dirReal, OUTSIDE)
      const entry = path.join(dir, name)
      const stat = await fs.lstat(entry).catch(err => (ignoreMissing(err), null))
      if (!stat) continue
      if (stat.isDirectory()) {
        await removeTree(realRoot, path.join(dirReal, name))
        if (!DESCRIPTOR_PATHS_PINNED) await confirmDescriptor(handle, realRoot, dirReal, OUTSIDE)
        await fs.rmdir(entry).catch(ignoreMissing)
      } else {
        await fs.unlink(entry).catch(ignoreMissing)
      }
    }
  } finally {
    await handle.close().catch(() => {})
  }
}
