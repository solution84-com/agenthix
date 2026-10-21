/**
 * What hq may ask this site about the files in one of its own storage
 * locations (ADR-0051: a closed set of named methods, never a generic relay).
 * One function per `LOCATION_FILE_METHODS` control entry, registered in
 * `../hq/channelMethods.ts`; the bytes of a file are not here at all — they
 * cross the content transport, served by `../hq/content/locationReadHandler.ts`
 * off the same containment helper below.
 *
 * ## The site never asks who is calling
 *
 * Every params shape carries a location and a relative path, and NO user id.
 * An owner's `artefacts/` and `knowledge/` have methods of their own, in
 * `./ownerFolderMethods.ts`.
 * hq applies its entitlement check before it asks; per ADR-0042 an Execution
 * Site holds no identity store and has nothing to re-derive that from, so a
 * `userId` on this wire would be a field the site could only take on trust
 * while looking as though it had checked something.
 *
 * ## What the site does check
 *
 * Containment, and only containment — `./locationContainment.ts` owns it, and
 * owns naming a refusal so that no message crossing to hq carries a path on
 * this site's disk.
 *
 * ## What a listing may say
 *
 * Names, kinds, sizes and modification times. Never an absolute host path.
 * Where a file sits on the site's disk is the site's business.
 *
 * ## Params arrive as `unknown`
 *
 * hq is the only caller and it is trusted, but the JSON still comes off a
 * socket, so every function validates its own shape — the same defensive
 * pattern `workspaceRows.ts` follows. Every one of those `.parse()` calls goes
 * through `parseParams`, so a payload that does not match leaves as a coded
 * `invalid` refusal rather than as a raw `ZodError` hq cannot classify.
 *
 * Those zod schemas are a hand-written mirror of core's types, and the `Exact`
 * assertions below are what pin them to it. What that guards, precisely: a
 * field added to, removed from or renamed in either the schema or the core
 * type it mirrors, at any depth and whether optional or required, fails to
 * compile. What it does NOT guard is anything `tsc` never sees — vitest
 * transpiles these assertions away, so `npx tsc --noEmit` is not optional for
 * this module, and `__tests__/locationFileMethods.test.ts` carries a runtime
 * half for the schema side.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { WorkspaceOwnerType } from '@prisma/client'
import {
  LOCATION_FILE_METHODS,
  LOCATION_SEED_MAX_BYTES,
  LOCATION_SEED_MAX_FILES,
  LocationFileError,
  WORKSPACE_OWNER_TYPES,
  type Exact,
  type LocationRef as WireLocationRef,
  type StorageOwnerType,
  type LocationEntry,
  type LocationEntryKind,
  type LocationListFilesParams,
  type LocationListFilesResult,
  type LocationStatFileParams,
  type LocationStatFileResult,
  type LocationSeedFile,
  type LocationSeedFilesParams,
  type LocationSeedFilesResult,
  type LocationEnsureDirParams,
  type LocationEnsureDirResult,
  type LocationReadFileParams,
} from '@agenthix/core'
import { describeLocation, locationFileError, openInLocation, parseParams, refuse, resolveInLocation } from './locationContainment'
import {
  DESCRIPTOR_PATHS_PINNED,
  confirmDescriptor,
  descriptorPath,
  statContained,
} from '../../agents/runtime/containedFile'

/**
 * Core cannot import this app's generated Prisma types, so the wire declares
 * its own owner vocabulary. Asserted in BOTH directions: a one-directional
 * check passes while core is missing an owner kind the schema has, which is
 * the direction that actually breaks — the wire would narrow silently and a
 * location of the new kind would be unreachable.
 */
type _CoreCoversPrisma = WorkspaceOwnerType extends StorageOwnerType ? true : never
type _PrismaCoversCore = StorageOwnerType extends WorkspaceOwnerType ? true : never
const _ownerTypesAgree: [_CoreCoversPrisma, _PrismaCoversCore] = [true, true]
void _ownerTypesAgree

const locRefSchema = z
  .object({
    ownerType: z.enum(WORKSPACE_OWNER_TYPES),
    ownerId: z.string().min(1),
    workspaceId: z.string().nullish(),
    taskId: z.string().nullish(),
  })

/**
 * Exported so the "no caller" property is a test the wire can fail, not a
 * reading of this file. Same for the four below.
 */
export const LIST_FILES_PARAMS_SHAPE = { loc: locRefSchema, subPath: z.string().nullish() }
export const STAT_FILE_PARAMS_SHAPE = { loc: locRefSchema, relPath: z.string().min(1) }
/**
 * `z.literal(true)`, not `z.boolean()`: seeding has exactly one mode, and the
 * flag is how the CALL states it rather than how this handler assumes it. A
 * request asking to overwrite is refused at the wire — there is no branch here
 * that would serve it.
 */
const seedFileSchema = z.object({ relPath: z.string().min(1), content: z.string(), ifAbsent: z.literal(true) })
export const SEED_FILES_PARAMS_SHAPE = { loc: locRefSchema, files: z.array(seedFileSchema) }
export const ENSURE_DIR_PARAMS_SHAPE = { loc: locRefSchema, subPath: z.string().nullish() }
export const READ_FILE_PARAMS_SHAPE = { loc: locRefSchema, relPath: z.string().min(1) }

const listFilesParams = z.object(LIST_FILES_PARAMS_SHAPE)
const statFileParams = z.object(STAT_FILE_PARAMS_SHAPE)
const seedFilesParams = z.object(SEED_FILES_PARAMS_SHAPE)
const ensureDirParams = z.object(ENSURE_DIR_PARAMS_SHAPE)
export const readFileParams = z.object(READ_FILE_PARAMS_SHAPE)

/**
 * The zod schemas above, pinned against CORE's types rather than this app's own.
 *
 * `./paths.ts` no longer declares a second `LocationRef` — it re-exports
 * core's, so the shape needs no pin. The schemas do: pinning one against a
 * local copy would leave core's free to gain a field that nothing checked, and
 * these schemas drop a field they do not list, so such a field would be
 * silently lost at runtime with everything compiling.
 */
const _wireMirrorsCore: [
  Exact<z.infer<typeof locRefSchema>, WireLocationRef>,
  Exact<z.infer<typeof seedFileSchema>, LocationSeedFile>,
  Exact<z.infer<typeof listFilesParams>, LocationListFilesParams>,
  Exact<z.infer<typeof statFileParams>, LocationStatFileParams>,
  Exact<z.infer<typeof seedFilesParams>, LocationSeedFilesParams>,
  Exact<z.infer<typeof ensureDirParams>, LocationEnsureDirParams>,
  Exact<z.infer<typeof readFileParams>, LocationReadFileParams>,
] = [true, true, true, true, true, true, true]
void _wireMirrorsCore

function kindOf(stat: { isDirectory(): boolean }): LocationEntryKind {
  return stat.isDirectory() ? 'directory' : 'file'
}

/**
 * The entries directly under a location, or under one directory inside it.
 *
 * A symlink is listed only when its real path stays inside the location — the
 * rule every read here applies — so the listing never offers an entry a read
 * of it would refuse. The directory is listed through its open descriptor and
 * each link is opened and confirmed before its size is reported, so a swap
 * after the check shows nothing of what lies outside. `.git` is listed like anything else: whether to show it
 * is hq's presentation rule, and hiding it here would also hide it from the
 * repository-state probe, which is the one caller that wants to know.
 *
 * A directory that is NOT THERE reads as empty rather than as a failure: a
 * location whose disk has not been provisioned yet is an ordinary state, and
 * hq's own listing behaved this way before it crossed the channel. That is the
 * only failure swallowed. A directory this site may not read, or a path that
 * turns out to be a file, is a refusal — an unreadable directory reported as
 * an empty one is the failure mode nobody ever finds out about.
 */
export async function listFiles(params: unknown): Promise<LocationListFilesResult> {
  const method = LOCATION_FILE_METHODS.listFiles
  const { loc, subPath } = parseParams(listFilesParams, params, method)
  let opened
  try {
    opened = await openInLocation(loc, method, subPath, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY)
  } catch (err) {
    if (err instanceof LocationFileError && err.code === 'not_found') return { entries: [] }
    throw err
  }
  const { handle, base, abs, realRoot, realTarget } = opened
  try {
    // Listed through the open descriptor (see `descriptorPath`), so a directory
    // swapped for a link after the check lists nothing of where it points.
    const dir = descriptorPath(handle, realTarget)
    let dirents
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true })
      if (!DESCRIPTOR_PATHS_PINNED) await confirmDescriptor(handle, realRoot, realTarget, 'outside')
    } catch (err) {
      if (typeof (err as NodeJS.ErrnoException | null)?.code === 'string') refuse(err, method, loc, subPath)
      throw locationFileError('outside', method, loc, subPath)
    }

    const resolved = await Promise.all(dirents.map(async (dirent): Promise<LocationEntry | null> => {
      const stat = dirent.isSymbolicLink()
        ? await statContained(base, path.join(abs, dirent.name))
        : await fs.lstat(path.join(dir, dirent.name)).catch(() => null)
      if (!stat) return null
      return { name: dirent.name, kind: kindOf(stat), size: stat.size, modifiedAt: stat.mtime.toISOString() }
    }))
    const entries = resolved.filter((entry): entry is LocationEntry => entry !== null)

    entries.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name))
    return { entries }
  } finally {
    await handle.close().catch(() => {})
  }
}

/** One entry's kind, size and modification time. A `Date` does not survive the socket. */
export async function statFile(params: unknown): Promise<LocationStatFileResult> {
  const { loc, relPath } = parseParams(statFileParams, params, LOCATION_FILE_METHODS.statFile)
  const { handle, base } = await openInLocation(loc, LOCATION_FILE_METHODS.statFile, relPath, fsConstants.O_RDONLY)
  try {
    const stat = await handle.stat()
    return { name: path.basename(path.resolve(base, relPath)), kind: kindOf(stat), size: stat.size, modifiedAt: stat.mtime.toISOString() }
  } catch (err) {
    refuse(err, LOCATION_FILE_METHODS.statFile, loc, relPath)
  } finally {
    await handle.close().catch(() => {})
  }
}

/**
 * Write a new location's starter documents, skipping any that already exist.
 *
 * That each file is written only if absent is the CALL's to state, per file,
 * in `ifAbsent` — not this handler's to assume. hq provisions a location more
 * than once and depends on the second call writing nothing; carrying the rule
 * on the wire is what keeps it visible to the side that depends on it. The
 * flag is a literal `true`, so there is no overwriting mode to reach.
 *
 * Every path is contained BEFORE anything is written, so a payload carrying
 * one bad path leaves the location untouched rather than half-seeded.
 */
export async function seedFiles(params: unknown): Promise<LocationSeedFilesResult> {
  const { loc, files } = parseParams(seedFilesParams, params, LOCATION_FILE_METHODS.seedFiles)

  if (files.length > LOCATION_SEED_MAX_FILES) {
    throw new LocationFileError(
      'too_many',
      `${LOCATION_FILE_METHODS.seedFiles} carries ${files.length} files for ${describeLocation(loc)}, over the ` +
        `limit of ${LOCATION_SEED_MAX_FILES} — seeding writes starter documents, not a file set`,
    )
  }
  const total = files.reduce((sum, f) => sum + Buffer.byteLength(f.content), 0)
  if (total > LOCATION_SEED_MAX_BYTES) {
    throw new LocationFileError(
      'too_large',
      `${LOCATION_FILE_METHODS.seedFiles} payload for ${describeLocation(loc)} is ${total} bytes, over the ` +
        `${LOCATION_SEED_MAX_BYTES}-byte limit — seeding carries starter documents, not file uploads`,
    )
  }

  for (const file of files) await resolveInLocation(loc, LOCATION_FILE_METHODS.seedFiles, file.relPath)

  const written: string[] = []
  const skipped: string[] = []
  for (const file of files) {
    // `O_EXCL` is the "if absent": an existing name — a file, a directory, or a
    // link wherever it points — is skipped, and never written through.
    let handle
    try {
      ;({ handle } = await openInLocation(
        loc, LOCATION_FILE_METHODS.seedFiles, file.relPath,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, { createParents: true },
      ))
    } catch (err) {
      if (err instanceof LocationFileError && err.code === 'exists') {
        skipped.push(file.relPath)
        continue
      }
      throw err
    }
    try {
      await handle.writeFile(file.content, { encoding: 'utf8' })
    } catch (err) {
      refuse(err, LOCATION_FILE_METHODS.seedFiles, loc, file.relPath)
    } finally {
      await handle.close().catch(() => {})
    }
    written.push(file.relPath)
  }
  return { written, skipped }
}

/**
 * Create a location's directory, or one directory inside it, if it is not
 * already there.
 *
 * This exists because a site creates a location's directory only when a
 * container starts in it. hq creates a workspace before anything runs there,
 * and without this the directory would not exist — and every read of it would
 * fail — until the first run.
 */
export async function ensureDir(params: unknown): Promise<LocationEnsureDirResult> {
  const { loc, subPath } = parseParams(ensureDirParams, params, LOCATION_FILE_METHODS.ensureDir)
  const dir = await resolveInLocation(loc, LOCATION_FILE_METHODS.ensureDir, subPath)
  // `mkdir` with `recursive` answers the top-most directory it created, and
  // `undefined` when there was nothing to do — which is the honest answer to
  // "did this call create it", without a racy exists-then-create.
  let created
  try {
    created = await fs.mkdir(dir, { recursive: true })
  } catch (err) {
    refuse(err, LOCATION_FILE_METHODS.ensureDir, loc, subPath)
  }
  // `mkdir` resolves the path again, so a directory swapped for a link since
  // the check could have carried it outside. Opening what now stands there and
  // confirming it refuses that; what cannot be undone is an EMPTY directory
  // made outside in the instant of the swap (Node has no `mkdirat`).
  const { handle } = await openInLocation(loc, LOCATION_FILE_METHODS.ensureDir, subPath, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY)
  await handle.close().catch(() => {})
  return { created: created !== undefined }
}
