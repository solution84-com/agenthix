/**
 * A site's own files, named method by method (ADR-0051: a closed set of typed
 * events, never a generic relay). The contract between hq's typed caller
 * (`hq/src/storage/locationFileStore.ts`) and site's handlers
 * (`site/src/server/storage/locationFileMethods.ts`, plus the content handler
 * at `site/src/server/hq/content/locationReadHandler.ts`).
 *
 * Both sides key their registration and dispatch off `LOCATION_FILE_METHODS`
 * rather than the string literals, so a typo in either module fails to compile
 * instead of silently mismatching at the wire — the same discipline
 * `SITE_DATA_METHODS` and `RUNTIME_METHODS` already keep.
 *
 * ## Two transports, one rule
 *
 * Metadata crosses the control channel; file BYTES cross the content transport,
 * whatever the file's size. `location.readFile` is therefore a content method
 * and never a control one. A size threshold would mean two implementations of
 * one read, two sets of failure modes, and a boundary that is wrong for some
 * file the day it is chosen. The content transport already has framing, a
 * 16 MiB unread-buffer cap, write backpressure and a 64 KiB chunk bound.
 *
 * Listings and stats are small and bounded, so they cross as JSON. So does
 * `location.seedFiles`, which is a write and not a read: its content is the
 * handful of code-owned starter documents hq provisions a new location with,
 * capped at `LOCATION_SEED_MAX_BYTES` precisely so it cannot quietly become a
 * general file-write path. A general write belongs on the content transport,
 * as its own named method, when something needs one.
 *
 * ## What a listing may say
 *
 * Names, kinds and sizes. NEVER an absolute host path: where a file sits on the
 * site's disk is the site's business, and hq has no use for it. An earlier query
 * in this codebase leaked absolute host paths to any signed-in person; nothing
 * here repeats that, error messages included.
 *
 * ## Who checks what
 *
 * hq checks entitlement before it asks; the site checks containment. Every
 * params type below carries a place — a location, or one of an owner's
 * folders beside its `files/` — and a relative path, and NO user id — per
 * ADR-0042 an Execution Site holds no identity store and has nothing to
 * re-derive entitlement from. What the site does check is that the resolved
 * path lands inside the named location, resolving symlinks, so a planted link
 * cannot walk out. A knowledge change carries who made it, as a record the
 * site keeps beside the version and never checks (`locationKnowledge.ts`).
 */
import type { LocationRef, StorageOwnerType } from '../storage/locationRef.js'
import type {
  KnowledgeGrepParams, KnowledgeGrepResult, KnowledgeOwnerRef, KnowledgePageListing, KnowledgeSection,
} from './locationKnowledge.js'

export * from './locationKnowledge.js'
export * from './locationFind.js'
export * from './locationSkills.js'

export const LOCATION_FILE_METHODS = {
  /** Control channel: the entries directly under a location, or under one directory inside it. */
  listFiles: 'location.listFiles',
  /** Control channel (1.8): a location's files whose names hold a fragment, best first — `./locationFind.ts`. */
  findFiles: 'location.findFiles',
  /** Control channel (1.10): the skill folders in a place's files and its workspaces — `./locationSkills.ts`. */
  scanSkills: 'location.scanSkills',
  /** Content transport (1.11): one of a place's skill folders made to hold exactly the files streamed — `./locationSkills.ts`. */
  writeSkill: 'location.writeSkill',
  /** Control channel (1.11): one of a place's skill folders removed — `./locationSkills.ts`. */
  removeSkill: 'location.removeSkill',
  /**
   * Content transport (1.14): one photo or file a person added to a conversation, written into the place's shared
   * folder under a name of its own, never over another file — `../storage/sharedFiles.ts`.
   */
  shareFile: 'location.shareFile',
  /** Control channel: one entry's kind, size and modification time. */
  statFile: 'location.statFile',
  /** Control channel: write a new location's starter documents, each saying whether it may replace one. */
  seedFiles: 'location.seedFiles',
  /** Control channel: create a location's directory (or one directory inside it) if it is not there. */
  ensureDir: 'location.ensureDir',
  /**
   * Control channel: delete a location's directory, and everything under it, from the site's disk.
   * Idempotent — a directory that is already gone answers `{ removed: false }`, not a refusal.
   */
  removeLocation: 'location.remove',
  /** Content transport: one file's bytes, streamed. Never a control method — see this file's header. */
  readFile: 'location.readFile',
  /**
   * Control channel: the files directly in an owner's `artefacts/` folder.
   *
   * This and the three below are addressed by the OWNER rather than by a
   * `LocationRef`: `artefacts/` and `knowledge/` sit BESIDE the owner's
   * `files/`, so no location names them, and a location-relative path reaching
   * them would be an escape from the location. A fourth field on `LocationRef`
   * would make every caller of every location method carry a dimension only
   * these use.
   */
  listArtefacts: 'location.listArtefacts',
  /**
   * Content transport: one artefact's bytes, addressed by its file name in `artefacts/`. Deprecated since 1.8 (its
   * entry in `SiteContentMethods`): hq no longer calls it, since a relay serves an artefact on a ticket (`files.serve`).
   */
  readArtefact: 'location.readArtefact',
  /** Control channel: an owner's knowledge sections and pages, each page with its index entry and problems. */
  listKnowledge: 'location.listKnowledge',
  /** Content transport: one page's bytes, or one kept version's. */
  readKnowledge: 'location.readKnowledge',
  /**
   * Control channel: search an owner's knowledge pages with Grep's parameters, by ripgrep (since 1.7); before that,
   * a bounded excerpt of the files matching a query. Owner-addressed like the four above.
   */
  searchKnowledge: 'location.searchKnowledge',
  /** Control channel, the gate (1.7): a whole page written, carrying the version it started from. */
  writeKnowledge: 'location.writeKnowledge',
  /** Control channel, the gate (1.7): one passage of a page replaced. */
  editKnowledge: 'location.editKnowledge',
  /** Control channel, the gate (1.7): a page deleted (kept until pruned), or a page or version removed for good. */
  deleteKnowledge: 'location.deleteKnowledge',
  /** Control channel, the gate (1.7): a kept version saved back as the page. */
  restoreKnowledge: 'location.restoreKnowledge',
  /** Control channel (1.7): a page's kept versions, or the recently deleted pages. */
  knowledgeVersions: 'location.knowledgeVersions',
} as const

export type LocationFileMethod = (typeof LOCATION_FILE_METHODS)[keyof typeof LOCATION_FILE_METHODS]

/**
 * How many topic files one `location.listKnowledge` answers with, and how deep
 * it walks. Agents write `knowledge/`, so a listing of it is bounded the way a
 * boundary's skills tree is: a pathological tree costs a shorter list, never a
 * stalled channel. `truncated` says when the bound was reached.
 */
export const KNOWLEDGE_LIST_MAX_FILES = 2000
export const KNOWLEDGE_LIST_MAX_DEPTH = 8

/**
 * The most seed content one `location.seedFiles` call may carry, summed over
 * its files. Generous for the starter documents that exist (a roadmap stub, a
 * project stub, an agenda template — hundreds of bytes each), and small enough
 * that this method cannot be pressed into service as a general file write,
 * which belongs on the content transport instead.
 */
export const LOCATION_SEED_MAX_BYTES = 256 * 1024

/**
 * How many starter documents one `location.seedFiles` call may carry.
 *
 * A byte cap alone is not a bound on a seed: a thousand empty files is under
 * any byte cap and is not a set of starter documents. Both ends apply both
 * bounds — hq before it puts a payload on the wire, the site before it touches
 * a path — because a bound only the receiver enforces is one hq discovers by
 * being refused.
 */
export const LOCATION_SEED_MAX_FILES = 64

/**
 * Why a refusal from a site needs a vocabulary of its own.
 *
 * A control-channel failure and a content-stream failure each carry exactly
 * ONE string, so any distinction hq needs has nowhere to live but inside it.
 * Left as prose, hq would have to match on wording; left as the raw `fs`
 * error, the string carries the ABSOLUTE PATH the call failed on — which
 * hands hq the site's storage layout through the error path, the same leak the
 * result types above were shaped to avoid.
 *
 * So the site raises `LocationFileError`, whose message is
 * `<marker><code>: <detail>` and whose detail names the location and the
 * RELATIVE path and nothing else. hq reads the code back with
 * `LocationFileError.fromWire`.
 *
 * The marker is not decoration. Several of these codes are ordinary English
 * words, so a message that merely BEGINS with one is not evidence of anything
 * — `cancelled: Stream closed by the site` comes off this very transport, and
 * `failed: the run was cancelled` is a sentence. Sniffing a prefix out of free
 * text would adopt such a message, hand hq a code nobody set, and hide the
 * real failure behind it. The marker makes the encoding a statement rather
 * than a coincidence, and it is cheap: the human half still reads normally
 * after it in a log.
 */
export const LOCATION_FILE_ERROR_CODES = [
  /** The resolved path does not lie inside the location named in the call. */
  'outside',
  'not_found',
  /** Something is already at that path, and the operation would not replace it. */
  'exists',
  'not_a_file',
  'not_a_directory',
  /** The site's own process may not read or write there. */
  'refused',
  'too_large',
  'too_many',
  /** The stream was cancelled, or the connection went away, mid-operation. */
  'cancelled',
  /**
   * The params did not match the method's shape. hq's own bug, or a version
   * skew between the two — never something the person who asked can act on.
   *
   * It is a code rather than a raw validation error for the reason the
   * repository-work vocabulary states: left uncoded, the error crosses the
   * channel raw, reaches hq as an unclassified failure, and a person is shown
   * a blob of validation issues under a status nobody chose.
   */
  'invalid',
  /** Anything the site could not classify — never a reason to read the prose. */
  'failed',
] as const

export type LocationFileErrorCode = (typeof LOCATION_FILE_ERROR_CODES)[number]

/**
 * What says "this string was encoded by us". Nothing else in this system emits
 * it, which is the whole point — see the note above on why a bare code prefix
 * is not enough.
 */
export const LOCATION_FILE_ERROR_MARKER = 'location-file/'

/** `<marker><code>: <detail>`. Only the FIRST colon separates, so a detail may hold one. */
const ENCODED_ERROR = /^([a-z_]+): ([\s\S]*)$/

export function encodeLocationFileError(code: LocationFileErrorCode, detail: string): string {
  return `${LOCATION_FILE_ERROR_MARKER}${code}: ${detail}`
}

/**
 * Null for anything that is not one of ours — a message from another handler,
 * a raw `fs` error, a transport failure, or prose that merely opens with one
 * of these words. Never a partial guess: the marker must be there AND the
 * prefix behind it must be a published code.
 */
export function decodeLocationFileError(wire: string): { code: LocationFileErrorCode; message: string } | null {
  if (typeof wire !== 'string' || !wire.startsWith(LOCATION_FILE_ERROR_MARKER)) return null
  const match = ENCODED_ERROR.exec(wire.slice(LOCATION_FILE_ERROR_MARKER.length))
  if (!match) return null
  const code = match[1] as LocationFileErrorCode
  if (!(LOCATION_FILE_ERROR_CODES as readonly string[]).includes(code)) return null
  return { code, message: match[2] }
}

/**
 * One class for both apps rather than one each. The site raises it, hq rebuilds
 * it from the wire, and neither can drift from the other's idea of what the
 * codes mean.
 */
export class LocationFileError extends Error {
  constructor(readonly code: LocationFileErrorCode, readonly detail: string) {
    super(encodeLocationFileError(code, detail))
    this.name = 'LocationFileError'
  }

  /** Rebuild from the single string a channel or content failure carries. */
  static fromWire(wire: string): LocationFileError | null {
    const decoded = decodeLocationFileError(wire)
    return decoded ? new LocationFileError(decoded.code, decoded.message) : null
  }
}

/** What a directory entry is. A symlink is reported as whatever it resolves to. */
export type LocationEntryKind = 'file' | 'directory'

/**
 * One entry in a listing. `size` is the resolved target's size in bytes — for a
 * directory that is the directory entry's own size and means nothing useful, so
 * read it only for a file. `modifiedAt` is an ISO string, as on a stat.
 */
export interface LocationEntry {
  name: string
  kind: LocationEntryKind
  size: number
  modifiedAt: string
}

/** `subPath` is relative to the location, forward-slashed; absent means the location itself. */
export interface LocationListFilesParams {
  loc: LocationRef
  subPath?: string | null
}

export interface LocationListFilesResult {
  entries: LocationEntry[]
}

export interface LocationStatFileParams {
  loc: LocationRef
  relPath: string
}

/** `modifiedAt` is an ISO string — a Date does not survive the socket. */
export interface LocationStatFileResult {
  name: string
  kind: LocationEntryKind
  size: number
  modifiedAt: string
}

/** One starter document: where it goes inside the location, and its utf-8 text. */
export interface LocationSeedFile {
  relPath: string
  content: string
  /**
   * Write this only when nothing is already at that path.
   *
   * Required, per file, and only ever `true` — never a `boolean`. Required so
   * that never-overwriting is something the CALL states rather than something
   * the handler is trusted to keep assuming: "seed" and "overwrite" are one
   * flag apart, and left implicit the rule could be changed on the site with
   * nothing on hq's side to notice. Fixed at `true` because seeding has no
   * other mode — a seed that replaced what was there would be a general file
   * write wearing this method's name, and that belongs on the content
   * transport under a name of its own. The site validates the literal, so a
   * call asking to overwrite is refused at the wire rather than served by a
   * branch nobody asked for.
   */
  ifAbsent: true
}

export interface LocationSeedFilesParams {
  loc: LocationRef
  files: LocationSeedFile[]
}

/**
 * Which relative paths this call wrote, and which it left alone because
 * something was already there and the file asked to be written only if
 * absent. A second call against a location provisioned that way writes
 * nothing and says so.
 */
export interface LocationSeedFilesResult {
  written: string[]
  skipped: string[]
}

export interface LocationEnsureDirParams {
  loc: LocationRef
  subPath?: string | null
}

/** `created` is false when the directory was already there — the call still succeeded. */
export interface LocationEnsureDirResult {
  created: boolean
}

/**
 * What `location.remove` deletes.
 *
 * By default, the directory the `loc` names — a person's or project's `files/`,
 * one workspace, or one task's directory — and everything under it.
 *
 * `wholeOwner: true` deletes the OWNER's entire storage directory instead: its
 * files, knowledge, artefacts, workspaces, tasks and members. That is what
 * deleting a project has to do, and it cannot be expressed with a location,
 * because `files/`, `knowledge/` and `artefacts/` are siblings and no
 * `LocationRef` names the directory above them (the same reason
 * `location.listArtefacts` and the rest are addressed by the owner). It is a separate, literal
 * flag rather than a reading of an owner-only `loc` on purpose: an owner-only
 * `loc` already means "the files directory" to every other method, so giving it
 * a second meaning here would let a caller wipe a whole owner's storage
 * believing it was clearing one folder. Only `true` is admitted, and `loc` must
 * then name the owner alone (no workspace, no task).
 */
export interface LocationRemoveParams {
  loc: LocationRef
  wholeOwner?: true
}

/** `removed` is false when there was nothing there to remove — the call still succeeded. */
export interface LocationRemoveResult {
  removed: boolean
}

export interface LocationReadFileParams {
  loc: LocationRef
  relPath: string
}

/** An owner of storage, for the methods that address a folder beside its `files/`. */
export interface StorageOwnerRef {
  ownerType: StorageOwnerType
  ownerId: string
}

/** One file in an owner's folder: its path relative to that folder, size in bytes, and ISO modification time. */
export interface OwnerFolderFile {
  path: string
  size: number
  modifiedAt: string
}

export type LocationListArtefactsParams = StorageOwnerRef

/**
 * The FILES directly in `artefacts/`, each one artefact (one item an agent
 * made, one file). A directory or a link there is not one and is not listed.
 */
export interface LocationListArtefactsResult {
  entries: OwnerFolderFile[]
}

/**
 * One artefact, by its file name directly in `artefacts/` — a name, never a
 * path. `maxBytes` is the most hq will take: a larger file is refused
 * `too_large` before a byte is sent.
 */
export interface LocationReadArtefactParams extends StorageOwnerRef {
  name: string
  maxBytes: number
}

export interface LocationListKnowledgeParams extends KnowledgeOwnerRef {}

/**
 * An owner's knowledge, up to `KNOWLEDGE_LIST_MAX_FILES` pages and
 * `KNOWLEDGE_LIST_MAX_DEPTH` deep. Hidden entries and links are not listed.
 * Since 1.7 a site answers `sections` and `pages`, each page with its index
 * entry and its problems; `files` stays for hq on 1.6, the same pages' paths.
 */
export interface LocationListKnowledgeResult {
  /** @deprecated since 1.7; stops working in 3.0. Use `pages` instead. */
  files: OwnerFolderFile[]
  truncated: boolean
  sections?: KnowledgeSection[]
  pages?: KnowledgePageListing[]
}

/**
 * One page, by its path inside the owner's knowledge pages, or with
 * `versionId` one of its kept versions (a deleted page's included).
 * `maxBytes` as for an artefact.
 */
export interface LocationReadKnowledgeParams extends KnowledgeOwnerRef {
  relPath: string
  maxBytes: number
  versionId?: string
}

/**
 * Search an owner's knowledge. Since 1.7, with `grep`, the site runs ripgrep with Grep's parameters and answers in
 * `grep`; it then ignores `query` and `maxChars`, which hq still fills (the pattern, and its size cap) so that a site
 * on 1.6 answers the old way: the query split into terms, the best matching lines with a few lines of context,
 * until `maxChars` of text.
 */
export interface LocationSearchKnowledgeParams extends KnowledgeOwnerRef {
  /** @deprecated since 1.7; stops working in 3.0. Use `grep` instead. */
  query: string
  /** @deprecated since 1.7; stops working in 3.0. Use `grep` instead. */
  maxChars: number
  grep?: KnowledgeGrepParams
}

/** A run of lines from one knowledge file, 1-based and inclusive, paths relative to `knowledge/`. */
export interface KnowledgeSearchExcerpt {
  path: string
  startLine: number
  endLine: number
  text: string
}

/** A site on 1.7 answers a `grep` search in `grep`, with the three older fields empty. */
export interface LocationSearchKnowledgeResult {
  /** @deprecated since 1.7; stops working in 3.0. Use `grep` instead. */
  excerpts: KnowledgeSearchExcerpt[]
  /** @deprecated since 1.7; stops working in 3.0. Use `grep` instead. */
  cut: string[]
  /** The site stopped reading files at the listing bound, so matches may be missing. */
  truncated: boolean
  grep?: KnowledgeGrepResult
}

/**
 * `location.shareFile` (1.14): the stream carries the file's bytes, exactly `size` of them. The site writes them into
 * `SHARED_FOLDER` of the place's files under `name` (`sharedNameProblem` must pass), or, when a file of that name is
 * there, under the first free `numberedSharedName`, refusing a link anywhere on the way; it answers on the stream with
 * a `LocationShareFileResult` as JSON, then ends.
 */
export interface LocationShareFileParams {
  /** The place: a `LocationRef` with no workspace and no task. */
  loc: LocationRef
  name: string
  size: number
}

/** The name the file was written under, in the shared folder. */
export interface LocationShareFileResult {
  name: string
}
