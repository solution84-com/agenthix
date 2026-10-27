/**
 * hq's typed store over the site channel for the files in a storage location.
 * One function per `LOCATION_FILE_METHODS` entry
 * (core/src/protocol/locationFiles.ts), calling the handlers at
 * `site/src/server/storage/locationFileMethods.ts` and, for the bytes,
 * `site/src/server/hq/content/locationReadHandler.ts`. Every method name is
 * read from that constant, never re-typed as a string literal here.
 *
 * ## The `OnSite` suffix is load-bearing
 *
 * hq's Wasp query that lists a location's files is already called
 * `listLocationFiles`, and it is what checks entitlement. Two functions with
 * one name, one checking entitlement and one not, is how an unchecked read
 * gets written by someone who imported the wrong one. **Nothing here checks
 * who is asking.** A caller must have applied `assertLocationAccess` (or an
 * equivalent) before it reaches this module; the site holds no identity store
 * and cannot check it for us (ADR-0042).
 *
 * ## Metadata here, bytes on the content transport
 *
 * `readFileOnSite` opens a content stream; everything else is a JSON request
 * on the control channel. That split is deliberate and has no size threshold
 * — see `core/src/protocol/locationFiles.ts` for why.
 *
 * ## An unreachable site is never an empty answer
 *
 * `offline`, `timeout` and `disconnected` all become `SiteUnreachableError`,
 * on both transports — the same class `workspaceStore.ts` and
 * `siteRuntimeStore.ts` raise, imported rather than redeclared. An empty
 * listing for a site that is merely down would hide data that still exists.
 * Any other failure propagates as what it is.
 *
 * The site is resolved here, from the location itself, rather than passed in:
 * `resolveStorageSite` is already the one answer to "which site holds this
 * location", and a caller that had to resolve it first could resolve it
 * differently.
 */
import { prisma } from 'wasp/server'
import {
  LOCATION_FILE_METHODS,
  LOCATION_SEED_MAX_BYTES,
  LOCATION_SEED_MAX_FILES,
  LocationFileError,
  type StorageOwnerType,
  type LocationRef,
  type LocationListFilesResult,
  type LocationStatFileResult,
  type LocationSeedFile,
  type LocationSeedFilesResult,
  type LocationEnsureDirResult,
  type LocationRemoveResult,
  type SiteMethodParams,
  type SiteMethodResult,
} from '@agenthix/core'
import type { WorkspaceOwnerType } from '@prisma/client'
import { siteChannelRegistry, ChannelRequestFailed } from '../sites/channel'
import { openContentStream, ContentStreamFailed } from '../sites/content'
import { SiteUnreachableError, reasonFor } from './workspaceStore'
import { resolveStorageSite } from './storageSite'
import { displaySiteName } from '../shared/siteName'

/**
 * Core cannot import this app's generated Prisma types, so the wire declares
 * its own owner vocabulary. Asserted in BOTH directions: a one-directional
 * check passes while core is missing an owner kind the schema has, which is
 * the direction that actually breaks — hq would keep compiling while a
 * location of the new kind could never be named on the wire.
 *
 * The location SHAPE needs no such pin: hq no longer declares one of its own,
 * and the `LocationRef` imported above is core's. Only the owner vocabulary can
 * still disagree, because only that half comes from this app's schema.
 */
type _CoreCoversPrisma = WorkspaceOwnerType extends StorageOwnerType ? true : never
type _PrismaCoversCore = StorageOwnerType extends WorkspaceOwnerType ? true : never
const _ownerTypesAgree: [_CoreCoversPrisma, _PrismaCoversCore] = [true, true]
void _ownerTypesAgree

/**
 * How long a whole `location.readFile` may take, start to finish.
 *
 * `CONTENT_OPEN_TIMEOUT_MS` bounds only the site ACCEPTING the stream, so a
 * read that is accepted and then stops progressing has nothing bounding it at
 * all: the stream stays open, and its caller — a Wasp query, holding a request
 * — waits with it. The precedent is `PACKAGE_PUT_TIMEOUT_MS`, the other
 * caller-owned completion budget on this transport, and this matches it.
 *
 * Generous on purpose. It exists to turn a stall into a stated failure, not to
 * police how long a large file may legitimately take.
 */
export const LOCATION_READ_TIMEOUT_MS = 60_000

type SiteInfo = { label: string; status: string | null; protocolVersion: string | null }

/** Same shape and purpose as workspaceStore.ts's own private helper. */
async function siteInfoForLogicalSiteId(logicalSiteId: string): Promise<SiteInfo> {
  const site = await prisma.executionSite
    .findUnique({ where: { siteId: logicalSiteId }, select: { label: true, isDefault: true, status: true, protocolVersion: true } })
    .catch(() => null)
  return { label: site ? displaySiteName(site) : logicalSiteId, status: site?.status ?? null, protocolVersion: site?.protocolVersion ?? null }
}

/**
 * Exactly the four fields the wire declares, and nothing a caller's object
 * happened to be carrying beside them. hq's callers hold Prisma rows and
 * repo targets; site validates strictly and refuses an unexpected field, so
 * normalising here is what keeps that strictness from reading as a bug.
 */
function toWireLocation(loc: LocationRef): LocationRef {
  return {
    ownerType: loc.ownerType,
    ownerId: loc.ownerId,
    workspaceId: loc.workspaceId ?? null,
    taskId: loc.taskId ?? null,
  }
}

/**
 * Both transports funnel their failures through here, so the two cannot
 * disagree — `./ownerFolderStore.ts` included.
 */
export async function translateFailure(logicalSiteId: string, method: string, err: unknown): Promise<never> {
  const code = err instanceof ChannelRequestFailed || err instanceof ContentStreamFailed ? err.code : null
  if (code === 'offline' || code === 'timeout' || code === 'disconnected') {
    const site = await siteInfoForLogicalSiteId(logicalSiteId)
    throw new SiteUnreachableError(site.label, logicalSiteId, reasonFor(site.status), site.protocolVersion)
  }
  // The site's own refusals arrive as one string on either transport, with the
  // code encoded into it — so a caller can tell "not found" from "refused"
  // without matching on prose. Anything that is not one of ours is left alone.
  if (err instanceof Error) {
    const fromSite = LocationFileError.fromWire(err.message)
    if (fromSite) throw fromSite
  }
  throw err
}

/** The control-channel methods addressed by a location. */
type LocationMethod =
  | typeof LOCATION_FILE_METHODS.listFiles
  | typeof LOCATION_FILE_METHODS.statFile
  | typeof LOCATION_FILE_METHODS.seedFiles
  | typeof LOCATION_FILE_METHODS.ensureDir
  | typeof LOCATION_FILE_METHODS.removeLocation

/** The one place every control-channel call funnels through. */
async function request<M extends LocationMethod>(
  loc: LocationRef,
  method: M,
  params: Omit<SiteMethodParams<M>, 'loc'>,
  /** Only for a caller whose location can no longer say where it lives — see `removeLocationOnSite`. */
  knownSiteId?: string,
): Promise<SiteMethodResult<M>> {
  const logicalSiteId = knownSiteId ?? await resolveStorageSite(loc)
  try {
    // `M` correlates the params with the method; TypeScript does not carry that through the spread.
    const sent = { loc: toWireLocation(loc), ...params } as SiteMethodParams<M>
    return await siteChannelRegistry.request(logicalSiteId, method, sent)
  } catch (err) {
    return translateFailure(logicalSiteId, method, err)
  }
}

/** The entries directly under a location, or under one directory inside it. */
export function listFilesOnSite(loc: LocationRef, subPath?: string | null): Promise<LocationListFilesResult> {
  return request(loc, LOCATION_FILE_METHODS.listFiles, { subPath: subPath ?? null })
}

/** One entry's kind, size and modification time. */
export function statFileOnSite(loc: LocationRef, relPath: string): Promise<LocationStatFileResult> {
  return request(loc, LOCATION_FILE_METHODS.statFile, { relPath })
}

/**
 * Write a location's starter documents.
 *
 * Seeding has one mode: a file already there is left alone. Each file still
 * carries `ifAbsent`, fixed at `true`, so the rule is something the caller
 * states on the wire rather than something the site is trusted to keep
 * assuming — and because the type admits no other value, there is no
 * overwriting mode for a caller to reach for.
 *
 * The bounds are checked HERE as well as on the site. A bound only the
 * receiver applies is one hq discovers by being refused — after it has already
 * put the payload on the wire — and the count bound matters as much as the
 * byte one: a thousand empty files is under any byte cap and is not a seed.
 */
export function seedFilesOnSite(loc: LocationRef, files: LocationSeedFile[]): Promise<LocationSeedFilesResult> {
  if (files.length > LOCATION_SEED_MAX_FILES) {
    return Promise.reject(
      new LocationFileError(
        'too_many',
        `${LOCATION_FILE_METHODS.seedFiles} would carry ${files.length} files, over the limit of ` +
          `${LOCATION_SEED_MAX_FILES} — seeding writes starter documents, not a file set`,
      ),
    )
  }
  const total = files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0)
  if (total > LOCATION_SEED_MAX_BYTES) {
    return Promise.reject(
      new LocationFileError(
        'too_large',
        `${LOCATION_FILE_METHODS.seedFiles} would carry ${total} bytes, over the ` +
          `${LOCATION_SEED_MAX_BYTES}-byte limit — seeding carries starter documents, not file uploads`,
      ),
    )
  }
  return request(loc, LOCATION_FILE_METHODS.seedFiles, { files })
}

/** Create a location's directory, or one directory inside it, if it is not there. */
export function ensureDirOnSite(loc: LocationRef, subPath?: string | null): Promise<LocationEnsureDirResult> {
  return request(loc, LOCATION_FILE_METHODS.ensureDir, { subPath: subPath ?? null })
}

/**
 * Delete a location's directory, and everything under it, from the site's disk.
 *
 * Idempotent on the site: a directory already gone answers `{ removed: false }`.
 * Nothing here checks who is asking — the caller applies entitlement first —
 * and this is the one method in the module whose effect cannot be undone.
 *
 * `wholeOwner` deletes the owner's entire storage directory (files, knowledge,
 * artefacts, workspaces, tasks, members) rather than the one location the ref
 * names; `loc` must then carry the owner alone. It is what deleting a project
 * needs, and the flag is explicit so an owner-only `loc` — which means a
 * `files/` directory everywhere else — is never read as "wipe the owner".
 *
 * `logicalSiteId` exists for the caller that deletes the row the site is
 * normally resolved FROM. A project's site is read off its own row, so once
 * that row is gone `resolveStorageSite` can only fail; the caller resolves it
 * first, while the row exists, and passes it in.
 */
export function removeLocationOnSite(
  loc: LocationRef,
  options: { wholeOwner?: boolean; logicalSiteId?: string } = {},
): Promise<LocationRemoveResult> {
  return request(
    loc,
    LOCATION_FILE_METHODS.removeLocation,
    options.wholeOwner ? { wholeOwner: true } : {},
    options.logicalSiteId,
  )
}

/**
 * One file's bytes, over the content transport.
 *
 * Collected whole, for hq's own small reads (a place's instructions), which it
 * holds as text. A file a person opens never comes this way: its bytes go from
 * the site through a relay (adr-0153).
 */
export async function readFileOnSite(loc: LocationRef, relPath: string): Promise<Buffer> {
  const logicalSiteId = await resolveStorageSite(loc)
  const method = LOCATION_FILE_METHODS.readFile
  return collectStream(logicalSiteId, method, { loc: toWireLocation(loc), relPath }, relPath)
}

/**
 * Open a content stream and collect it whole.
 *
 * Read with `data`/`end` listeners rather than `for await`, which is how the
 * site side of this transport learned to destroy a stream before it was done.
 */
export async function collectStream(
  logicalSiteId: string,
  method: string,
  params: object,
  what: string,
): Promise<Buffer> {
  try {
    const stream = await openContentStream(logicalSiteId, method, params)
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      const timer = setTimeout(() => {
        // Let the stream go rather than leaving it open behind the failure:
        // destroying it tells the site to stop reading too.
        stream.destroy()
        reject(
          new Error(
            `Reading "${what}" from Execution Site ${logicalSiteId} did not complete within ` +
              `${LOCATION_READ_TIMEOUT_MS}ms — the read was abandoned`,
          ),
        )
      }, LOCATION_READ_TIMEOUT_MS)
      timer.unref?.()
      const settle = (fn: () => void) => {
        clearTimeout(timer)
        fn()
      }
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      // A stream that failed part-way must not answer with what arrived — a
      // truncated file read as a whole one is worse than a failure.
      stream.on('error', (err: Error) => settle(() => reject(err)))
      stream.on('end', () => settle(() => resolve(Buffer.concat(chunks))))
    })
  } catch (err) {
    return translateFailure(logicalSiteId, method, err)
  }
}
