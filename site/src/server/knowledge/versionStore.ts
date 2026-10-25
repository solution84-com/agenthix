/**
 * Earlier and deleted pages (agent knowledge spec, part 2, *Versions and pruning*). A version is the whole earlier
 * page, kept at `versions/<page path>/<version id>.md`; its id is `<UTC yyyymmddTHHMMSSmmmZ>-<8 hex>`, so ids sort by
 * time. Beside a version, a marker says what replaced it, when that was not an edit:
 *
 *  - `<id>.deleted` — the page was deleted (or moved away) and this is what it held; the marker holds `deleted` or
 *    `moved`. A page that is not there and whose newest version is so marked is *Recently deleted*.
 *  - `<id>.restored` — a restore replaced it.
 *
 * Only the gate (`./gate.ts`) keeps versions; pruning removes them through `removeVersion` here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import {
  KNOWLEDGE_LIMITS,
  KNOWLEDGE_ORG_OWNER_ID,
  KNOWLEDGE_OWNER_TYPES,
  type KnowledgeChangeKind,
  type KnowledgeOwnerRef,
  type KnowledgeVersion,
} from '@agenthix/core'
import { getKnowledgeKindDir, knowledgePagesDir, knowledgeVersionsDir } from '../storage/paths'
import { entriesOf, inside, readText, removeText, rootExists, pruneEmptyFolders, writeText } from './fileAccess'

export const VERSION_ID = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-[0-9a-f]{8}$/
const VERSION_FILE = /^(\d{8}T\d{9}Z-[0-9a-f]{8})\.md$/
const MARKERS = ['deleted', 'restored'] as const

/** How long a deleted page stays in Recently deleted before pruning may remove it. */
export const DELETED_KEPT_DAYS = 30
/** The most versions one listing answers with. */
export const KNOWLEDGE_VERSIONS_MAX = 500

const DAY_MS = 24 * 60 * 60 * 1000

/** What replaced a kept version: an edit, a restore, or the page being deleted or moved away. */
export type VersionCause = Exclude<KnowledgeChangeKind, 'created'>

function idTime(id: string): number {
  const m = VERSION_ID.exec(id)
  if (!m) return NaN
  const [, y, mo, d, h, mi, s, ms] = m.map(Number)
  return Date.UTC(y, mo - 1, d, h, mi, s, ms)
}

/** A new id, later than every id in `after`, so a page's versions stay in order within one millisecond. */
export function newVersionId(after: readonly string[] = [], now = Date.now()): string {
  const latest = Math.max(-Infinity, ...after.map(idTime).filter(t => !Number.isNaN(t)))
  const at = new Date(Math.max(now, latest + 1)).toISOString()
  return `${at.replace(/[-:.]/g, '')}-${randomBytes(4).toString('hex')}`
}

export function savedAtOf(id: string): string {
  return new Date(idTime(id)).toISOString()
}

const versionFile = (page: string, id: string) => `${page}/${id}.md`
const markerFile = (page: string, id: string, marker: (typeof MARKERS)[number]) => `${page}/${id}.${marker}`

/** The ids kept for `page`, oldest first. */
export function versionIdsOf(owner: KnowledgeOwnerRef, page: string): string[] {
  const root = knowledgeVersionsDir(owner)
  if (!rootExists(root)) return []
  return idsIn(inside(root, page))
}

function idsIn(dir: string): string[] {
  return entriesOf(dir).filter(d => d.isFile()).map(d => VERSION_FILE.exec(d.name)?.[1]).filter((id): id is string => !!id).sort()
}

/** Keeps `text` as the page's newest version, marked with what replaced it. Answers its id. */
export function keepVersion(owner: KnowledgeOwnerRef, page: string, text: string, cause: VersionCause): string {
  const root = knowledgeVersionsDir(owner)
  const id = newVersionId(versionIdsOf(owner, page))
  writeText(root, versionFile(page, id), text, null)
  try {
    if (cause === 'deleted' || cause === 'moved') writeText(root, markerFile(page, id, 'deleted'), cause, null)
    else if (cause === 'restored') writeText(root, markerFile(page, id, 'restored'), '', null)
  } catch (err) {
    removeVersionNow(owner, page, id)
    throw err
  }
  return id
}

export function readVersion(owner: KnowledgeOwnerRef, page: string, id: string): { text: string; version: string } | null {
  if (!VERSION_ID.test(id)) return null
  return readText(knowledgeVersionsDir(owner), versionFile(page, id))
}

function describe(owner: KnowledgeOwnerRef, page: string, id: string): KnowledgeVersion | null {
  const root = knowledgeVersionsDir(owner)
  const kept = readText(root, versionFile(page, id))
  if (!kept) return null
  const deletedBy = readText(root, markerFile(page, id, 'deleted'))?.text.trim()
  const restored = readText(root, markerFile(page, id, 'restored')) !== null
  const deleted = deletedBy !== undefined
  const change: KnowledgeChangeKind = deleted ? (deletedBy === 'moved' ? 'moved' : 'deleted') : restored ? 'restored' : 'edited'
  const savedAt = savedAtOf(id)
  return {
    page, id, version: kept.version, savedAt, size: kept.bytes, change, deleted,
    ...(deleted ? { removeAfter: new Date(Date.parse(savedAt) + DELETED_KEPT_DAYS * DAY_MS).toISOString() } : {}),
  }
}

/** A page's kept versions, newest first. */
export async function listVersions(owner: KnowledgeOwnerRef, page: string): Promise<{ versions: KnowledgeVersion[]; truncated: boolean }> {
  const ids = versionIdsOf(owner, page).reverse()
  const versions = ids.slice(0, KNOWLEDGE_VERSIONS_MAX).map(id => describe(owner, page, id)).filter((v): v is KnowledgeVersion => !!v)
  return { versions, truncated: ids.length > KNOWLEDGE_VERSIONS_MAX }
}

/** Every page that has kept versions, by its name. Bounded by the sections a page may sit in. */
export async function listVersionedPages(owner: KnowledgeOwnerRef): Promise<string[]> {
  const root = knowledgeVersionsDir(owner)
  if (!rootExists(root)) return []
  const pages: string[] = []
  const walk = (dir: string, rel: string, depth: number) => {
    if (rel && idsIn(dir).length) pages.push(rel)
    if (depth > KNOWLEDGE_LIMITS.maxSectionDepth) return
    for (const d of entriesOf(dir)) {
      if (d.isDirectory()) walk(path.join(dir, d.name), rel ? `${rel}/${d.name}` : d.name, depth + 1)
    }
  }
  walk(inside(root, ''), '', 0)
  return pages
}

/** The pages in Recently deleted: not there now, their newest version marked deleted. Newest first. */
export async function listDeleted(owner: KnowledgeOwnerRef): Promise<{ versions: KnowledgeVersion[]; truncated: boolean }> {
  const pagesRoot = knowledgePagesDir(owner)
  const deleted: KnowledgeVersion[] = []
  for (const page of await listVersionedPages(owner)) {
    if (readPageQuietly(pagesRoot, page)) continue
    const newest = versionIdsOf(owner, page).at(-1)
    const version = newest ? describe(owner, page, newest) : null
    if (version?.deleted) deleted.push(version)
  }
  deleted.sort((a, b) => b.id.localeCompare(a.id))
  return { versions: deleted.slice(0, KNOWLEDGE_VERSIONS_MAX), truncated: deleted.length > KNOWLEDGE_VERSIONS_MAX }
}

function readPageQuietly(root: string, page: string): boolean {
  try {
    return readText(root, page) !== null
  } catch {
    return true
  }
}

/** Removes one kept version and its markers, for good. False when there was no such version. */
export async function removeVersion(owner: KnowledgeOwnerRef, page: string, versionId: string): Promise<boolean> {
  return removeVersionNow(owner, page, versionId)
}

/** `removeVersion`, synchronously, for the gate's own steps. */
export function removeVersionNow(owner: KnowledgeOwnerRef, page: string, versionId: string): boolean {
  if (!VERSION_ID.test(versionId)) return false
  const root = knowledgeVersionsDir(owner)
  const removed = removeText(root, versionFile(page, versionId))
  for (const marker of MARKERS) removeText(root, markerFile(page, versionId, marker))
  if (rootExists(root)) pruneEmptyFolders(root, versionFile(page, versionId))
  return removed
}

/** Removes every kept version of `page`, for good. Answers how many there were. */
export function removeAllVersions(owner: KnowledgeOwnerRef, page: string): number {
  const ids = versionIdsOf(owner, page)
  for (const id of ids) removeVersionNow(owner, page, id)
  return ids.length
}

/** The bytes an owner's kept versions take, markers included. */
export async function versionStats(owner: KnowledgeOwnerRef): Promise<{ totalBytes: number }> {
  const root = knowledgeVersionsDir(owner)
  let totalBytes = 0
  const walk = (dir: string, depth: number) => {
    for (const d of entriesOf(dir)) {
      const at = path.join(dir, d.name)
      if (d.isFile()) totalBytes += fs.lstatSync(at, { throwIfNoEntry: false })?.size ?? 0
      else if (d.isDirectory() && depth <= KNOWLEDGE_LIMITS.maxSectionDepth + 1) walk(at, depth + 1)
    }
  }
  if (rootExists(root)) walk(inside(root, ''), 0)
  return { totalBytes }
}

/** Every owner with knowledge on this site, for a job that walks them all. */
export async function listKnowledgeOwners(): Promise<KnowledgeOwnerRef[]> {
  const owners: KnowledgeOwnerRef[] = []
  for (const ownerType of KNOWLEDGE_OWNER_TYPES) {
    for (const d of entriesOf(getKnowledgeKindDir(ownerType))) {
      if (!d.isDirectory()) continue
      if (ownerType === 'org' && d.name !== KNOWLEDGE_ORG_OWNER_ID) continue
      owners.push({ ownerType, ownerId: d.name })
    }
  }
  return owners
}
