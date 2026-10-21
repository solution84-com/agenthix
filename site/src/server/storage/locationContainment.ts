/**
 * Where a path in a storage location is allowed to land, and what a site may
 * say when it does not.
 *
 * Split out of `locationFileMethods.ts`, which was carrying two jobs: this one
 * — resolving a location-relative path and naming a failure — and the four
 * channel methods themselves. Both importers reach this module directly:
 * `./locationFileMethods.ts` for the four control methods, and
 * `../hq/content/locationReadHandler.ts`, which depends on containment and not
 * on those methods, and should not have to import one to get the other.
 *
 * ## Containment
 *
 * The site does not re-derive who may do this: per ADR-0042 it holds no
 * identity store and has nothing to derive it from. hq checks entitlement
 * before it asks. What the site checks is that the resolved path lands inside
 * the location named in the call, with symlinks resolved on BOTH sides — a
 * link planted inside a location and pointing outside it is lexically inside
 * and sails through a prefix comparison. Only resolving it is a boundary.
 *
 * Agents write inside a location, so a link can also be swapped in AFTER the
 * check. Every operation therefore opens the path once and acts on the
 * descriptor (`openInLocation`, `openInOwnerFolder`, built on
 * `agents/runtime/containedFile.ts`), rather than checking a path and then
 * using it by path again.
 *
 * ## What a refusal may say
 *
 * A code and prose naming the method, the RELATIVE path and the location's own
 * hq-side ids. Never a path on this site's disk.
 *
 * That last rule is why nothing here lets an underlying error through.
 * `hqConnection.ts` and `contentConnection.ts` both forward a handler's
 * `err.message` to hq verbatim; a raw `fs` error's message ends with the
 * absolute path it failed on, `validatePathReal`'s default refusal ends with
 * the resolved root, and `assertSafeId`'s echoes the id it rejected. Each is
 * caught and replaced rather than wrapped.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { ZodError } from 'zod'
import { LocationFileError, type LocationFileErrorCode, type StorageOwnerRef } from '@agenthix/core'
import { locationDir, ownerDir, type LocationRef } from './paths'
import { WorkspaceService } from '../../agents/agentDiskPaths'
import {
  openResolved,
  resolveContained,
  type FileHandle,
  type Resolved,
} from '../../agents/runtime/containedFile'
import { Logger } from '../utils/logger'

const logger = new Logger('location')

/**
 * The refusal an escape earns, handed to the containment helper as its
 * boundary label. Deliberately path-free: the helper's own DEFAULT message
 * ends with the resolved root.
 *
 * It is a whole clause, so it is never interpolated INTO a sentence of ours —
 * doing that produced "… is the path is outside the location project p1", and
 * called an owner's folder a location besides. Our own messages say what they
 * mean directly, below.
 */
const OUTSIDE = 'the path is outside the location'

/**
 * A location as hq already knows it — its own ids, never a path on this disk.
 * This is what a refusal is allowed to name.
 */
export function describeLocation(loc: LocationRef): string {
  const owner = `${loc.ownerType} ${loc.ownerId}`
  if (loc.taskId) return `${owner} task ${loc.taskId}`
  if (loc.workspaceId) return `${owner} workspace ${loc.workspaceId}`
  return owner
}

/** errno to the vocabulary core publishes. Anything unrecognised stays `failed`. */
function codeForErrno(errno: string | undefined): LocationFileErrorCode {
  switch (errno) {
    case 'ENOENT':
      return 'not_found'
    case 'EEXIST':
      return 'exists'
    case 'ENOTDIR':
      return 'not_a_directory'
    case 'EISDIR':
      return 'not_a_file'
    case 'EACCES':
    case 'EPERM':
      return 'refused'
    default:
      return 'failed'
  }
}

export function locationFileError(
  code: LocationFileErrorCode,
  method: string,
  loc: LocationRef,
  relPath?: string | null,
): LocationFileError {
  return new LocationFileError(code, `${method} "${relPath || '.'}" in ${describeLocation(loc)}`)
}

/**
 * Which code a failure is, without deciding yet what a refusal may NAME — an
 * owner's folder and a location are described differently and classify the same.
 */
export function locationFileCodeFor(err: unknown): LocationFileErrorCode {
  if (err instanceof LocationFileError) return err.code
  const errno = (err as NodeJS.ErrnoException | null)?.code
  return codeForErrno(typeof errno === 'string' ? errno : undefined)
}

/** The same classification, returned rather than thrown — a stream handler
 *  needs the value to settle a promise with, not a throw. */
export function locationFileErrorFor(
  err: unknown,
  method: string,
  loc: LocationRef,
  relPath?: string | null,
): LocationFileError {
  if (err instanceof LocationFileError) return err
  return locationFileError(locationFileCodeFor(err), method, loc, relPath)
}

export function refuse(err: unknown, method: string, loc: LocationRef, relPath?: string | null): never {
  throw locationFileErrorFor(err, method, loc, relPath)
}

/**
 * The params, or a refusal that says so.
 *
 * `.parse()` belongs INSIDE the guard, the convention the repository-work
 * methods set (`./repoWorkRefusals.ts`) and the one this module was not brought
 * up to when it was written: left outside, a `ZodError` crosses the channel
 * raw, `hqConnection.ts` forwards its message verbatim as a handler failure,
 * hq's decoder finds no marker on it, and a person is shown a JSON blob of
 * issues under a 500 instead of one of the statuses this vocabulary exists to
 * give.
 *
 * Nothing is known about the call, so nothing is claimed about it: the refusal
 * names the method and stops there — no location, because whatever was on the
 * wire did not parse as one.
 *
 * Only the issues' PATHS and CODES are logged, never zod's rendered message and
 * never the input. These params carry no credential today, unlike a
 * `repo.connect`, but a log that echoes whatever arrived is the wrong habit to
 * have in the module that decides what a site may say.
 */
export function parseParams<T>(schema: { parse: (input: unknown) => T }, params: unknown, method: string): T {
  try {
    return schema.parse(params)
  } catch (err) {
    const issues = err instanceof ZodError ? err.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.code}`) : []
    logger.error(`${method} was called with parameters it does not accept: ${issues.join(', ') || 'unknown'}`)
    throw new LocationFileError('invalid', `${method} was called with parameters it does not accept`)
  }
}

/**
 * A location's own directory, with its own refusal.
 *
 * `locationDir` runs `assertSafeId`, whose message echoes the rejected id raw
 * — the last place an uncoded refusal could reach hq. Every caller goes
 * through here rather than calling `locationDir` directly, so there is one
 * answer to "what does a crafted owner id look like from hq" and it is a
 * `LocationFileError`.
 */
export function baseDir(loc: LocationRef, method: string, relPath?: string | null): string {
  try {
    return locationDir(loc)
  } catch {
    throw locationFileError('outside', method, loc, relPath)
  }
}

/**
 * Runs a containment step, turning what it throws into this module's refusals:
 * a real filesystem error (it carries an errno) is classified by `coded` — an
 * ENOTDIR for a path whose parent is a file is not an escape and must not be
 * reported as one — and a containment refusal (a plain `Forbidden:` error) by
 * `outside`. The helper's own message is discarded rather than wrapped: it can
 * name the resolved root.
 */
async function contained<T>(work: () => Promise<T>, coded: (err: unknown) => never, outside: () => never): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof LocationFileError) throw err
    if (typeof (err as NodeJS.ErrnoException | null)?.code === 'string') coded(err)
    outside()
  }
}

/**
 * The real path a location's directory must have: the owner's real folder plus
 * the layout's own path below it. A run mounts the owner's whole folder, so an
 * agent can replace `files/`, `workspaces/` or `tasks/` (or one entry in them)
 * with a link; resolving a location's base through such a link would make the
 * link's target the boundary. The owner's folder itself is site-made and is the
 * mount point, which a run cannot replace.
 */
export async function layoutRealBase(loc: LocationRef, base: string): Promise<string | null> {
  const home = ownerDir(loc.ownerType, loc.ownerId)
  const realHome = await realpathOrMissing(home)
  return realHome === null ? null : path.join(realHome, path.relative(home, base))
}

async function realpathOrMissing(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p)
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null
    throw err
  }
}

/**
 * Whether `base` is where the layout puts it, judged by its nearest part that
 * exists — a location not yet created (`ensureDir`'s first call) is checked
 * through the folder it will be made in.
 */
async function isAtLayoutPath(loc: LocationRef, base: string): Promise<boolean> {
  const home = ownerDir(loc.ownerType, loc.ownerId)
  const realHome = await realpathOrMissing(home)
  // An owner with no folder yet has nothing in it to have been replaced.
  if (realHome === null) return true
  for (let at = base; ; at = path.dirname(at)) {
    try {
      return (await fs.realpath(at)) === path.join(realHome, path.relative(home, at))
    } catch (err) {
      if ((err as NodeJS.ErrnoException | null)?.code !== 'ENOENT' || at === home) throw err
    }
  }
}

function inLocation(loc: LocationRef, method: string, relPath?: string | null) {
  const rel = relPath ?? ''
  if (path.isAbsolute(rel)) {
    throw new LocationFileError('outside', `${method} needs a relative path inside ${describeLocation(loc)}`)
  }
  const base = baseDir(loc, method, rel)
  return {
    base,
    abs: path.resolve(base, rel),
    coded: (err: unknown): never => refuse(err, method, loc, rel),
    outside: (): never => {
      throw new LocationFileError('outside', `${method} "${rel || '.'}" is outside ${describeLocation(loc)}`)
    },
  }
}

/**
 * A location's directory plus one relative path inside it, refused unless the
 * result really lands inside — symlinks resolved, both sides, so a link
 * planted in the location cannot walk out.
 *
 * This only CHECKS a path. Anything that then reads, writes or lists it by
 * path re-resolves it, and agents can plant links in a location; so an
 * operation opens through `openInLocation` instead, and this is left for
 * checking a whole batch before any of it is acted on.
 */
export async function resolveInLocation(loc: LocationRef, method: string, relPath?: string | null): Promise<string> {
  const { base, abs, coded, outside } = inLocation(loc, method, relPath)
  return contained(async () => {
    const real = await WorkspaceService.validatePathReal(abs, base, OUTSIDE)
    if (!(await isAtLayoutPath(loc, base))) outside()
    return real
  }, coded, outside)
}

export interface OpenedInLocation extends Resolved {
  handle: FileHandle
  /** The location's own directory, lexically: what a contained entry is checked against. */
  base: string
  /** The target, lexically — the form a further path under it is built from. */
  abs: string
}

/**
 * The same containment as `resolveInLocation`, as ONE resolution: the path is
 * opened once and the descriptor confirmed to be the entry the check approved
 * (`agents/runtime/containedFile.ts`), so a link swapped in after the check
 * cannot steer what is then done through the handle. `createParents` makes the
 * missing directories above the target first. The caller closes the handle.
 */
export async function openInLocation(
  loc: LocationRef,
  method: string,
  relPath: string | null | undefined,
  flags: number,
  opts: { createParents?: boolean } = {},
): Promise<OpenedInLocation> {
  const { base, abs, coded, outside } = inLocation(loc, method, relPath)
  return contained(async () => {
    const resolved = await resolveContained(base, abs, OUTSIDE)
    // Checked on the root the open is then confined to, so a link swapped in
    // after this cannot move it.
    const expected = await layoutRealBase(loc, base)
    if (!(await isAtLayoutPath(loc, base)) || (expected !== null && resolved.realRoot !== expected)) outside()
    if (opts.createParents) await fs.mkdir(path.dirname(resolved.realTarget), { recursive: true })
    return { ...resolved, base, abs, handle: await openResolved(resolved, flags, OUTSIDE) }
  }, coded, outside)
}

/** The folders beside an owner's `files/` that hq reads by the owner rather than by a location. */
export type OwnerFolder = 'artefacts' | 'knowledge'

/** The same rule as `describeLocation`: hq's own ids, never a path on this disk. */
export function describeOwnerFolder(owner: StorageOwnerRef, folder: OwnerFolder): string {
  return `${owner.ownerType} ${owner.ownerId} ${folder}`
}

export interface OpenedInOwnerFolder extends Resolved {
  handle: FileHandle
}

/**
 * One path inside one of an owner's folders, opened once, with every link
 * refused — not only a link that leads out.
 *
 * Stricter than `openInLocation`, which follows a link that stays inside. An
 * agent writes these folders through its mount and hq shows what is in them,
 * so the rule is the simple one: what hq lists and reads here is a real file
 * at the path named. Three checks, each against the real disk:
 *
 *  - the folder itself is a real directory where the layout puts it. A run
 *    mounts the owner's whole folder, so an agent can replace `artefacts/` or
 *    `knowledge/` with a link to anywhere on this machine; resolving the base
 *    through such a link would make the link's target the boundary;
 *  - the path's real form is its lexical form under the folder, so no part of
 *    it is a link;
 *  - the open does not follow a link at its last part, and the descriptor is
 *    confirmed to be the entry a link-free walk finds (`openResolved`), so a
 *    link swapped in after the checks is refused too.
 *
 * A missing folder or file is `not_found`. The caller closes the handle.
 */
export async function openInOwnerFolder(
  owner: StorageOwnerRef,
  folder: OwnerFolder,
  method: string,
  relPath: string,
  flags: number,
): Promise<OpenedInOwnerFolder> {
  const described = `${method} "${relPath || '.'}" in ${describeOwnerFolder(owner, folder)}`
  // Annotated, not inferred: TypeScript narrows on a `never`-returning call
  // only when the name it is called through carries an explicit type.
  const outside: () => never = () => {
    throw new LocationFileError('outside', described)
  }
  const coded = (err: unknown): never => {
    throw new LocationFileError(locationFileCodeFor(err), described)
  }
  if (path.isAbsolute(relPath)) {
    // Not echoed: an absolute path is a path on this disk, whoever wrote it.
    throw new LocationFileError('outside', `${method} needs a relative path inside ${describeOwnerFolder(owner, folder)}`)
  }

  let home: string
  try {
    home = ownerDir(owner.ownerType, owner.ownerId)
  } catch {
    // `assertSafeId`'s message echoes the rejected id raw — the same reason
    // `baseDir` above exists.
    outside()
  }
  const base = path.join(home, folder)
  const target = path.resolve(base, relPath)
  if (target !== base && !target.startsWith(base + path.sep)) outside()

  return contained(async () => {
    const realHome = await fs.realpath(home)
    const realRoot = await fs.realpath(base)
    if (realRoot !== path.join(realHome, folder)) outside()
    const realTarget = await fs.realpath(target)
    if (realTarget !== path.join(realRoot, path.relative(base, target))) outside()
    const resolved = { realRoot, realTarget }
    return { ...resolved, handle: await openResolved(resolved, flags, OUTSIDE) }
  }, coded, outside)
}
