/**
 * The itemiser (`location.listKnowledge`): walks an owner's `pages/` and answers its sections and its pages, each
 * page with its index entry and everything wrong with it under T1–T5. A page with problems is still listed, titled
 * from its file name; only a file put on the disk outside the gate can have any.
 *
 * Every folder and file is opened through the file tools' verified open, so a link, at an entry or anywhere on its
 * path, is refused rather than followed. Hidden names and links are not listed. The walk is bounded by the listing
 * bounds (`KNOWLEDGE_LIST_MAX_FILES`, a page `maxSectionDepth` sections deep).
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  KNOWLEDGE_LIST_MAX_FILES,
  KNOWLEDGE_LIMITS,
  LocationFileError,
  type KnowledgeOwnerRef,
  checkPageForListing,
  knowledgeProblem,
  titleFromPageName,
  type KnowledgePageListing,
  type KnowledgeSection,
  type LocationListKnowledgeResult,
  type OwnerFolderFile,
} from '@agenthix/core'
import {
  MAX_FILE_BYTES,
  NotFoundError,
  closeQuietly,
  listFolder,
  openForRead,
  readTextFile,
  systemFdPaths,
  versionOf,
  type FdPaths,
} from '@agenthix/core/file-tools'
import { describeKnowledgeOwner } from './owner'
import { pagesFolderOf } from './pagesRoot'
import { knowledgePagesDir } from '../storage/paths'

interface Found { page: string; size: number; modifiedAt: string }

function outside(owner: KnowledgeOwnerRef): never {
  // An id that is not safe is never echoed.
  let who = 'a knowledge folder'
  try {
    knowledgePagesDir(owner)
    who = describeKnowledgeOwner(owner)
  } catch { /* named without the id */ }
  throw new LocationFileError('outside', `location.listKnowledge in ${who}`)
}

/** The regular, non-hidden files and folders below `root`, folders breadth-first, entries in name order. */
function walk(sys: FdPaths, root: string, owner: KnowledgeOwnerRef): { found: Found[]; folders: string[]; truncated: boolean } {
  const found: Found[] = []
  const folders: string[] = []
  let truncated = false
  const queue: { rel: string; depth: number }[] = [{ rel: '', depth: 0 }]
  while (queue.length && !truncated) {
    const { rel, depth } = queue.shift()!
    const dir = rel === '' ? root : path.join(root, rel)
    let names: { name: string; dir: boolean; file: boolean }[]
    try {
      const { fd } = openForRead(sys, dir)
      try {
        names = listFolder(sys, fd).map(e => ({ name: e.name, dir: e.isDirectory(), file: e.isFile() }))
      } finally {
        closeQuietly(fd)
      }
    } catch (err) {
      // Nothing written yet is an empty listing; the folder itself failing otherwise is the listing failing, and a
      // folder below it that fails (a link swapped in) is left out.
      if (rel === '') {
        if (err instanceof NotFoundError) return { found, folders, truncated }
        outside(owner)
      }
      continue
    }
    for (const e of names.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (e.name.startsWith('.')) continue
      const child = rel === '' ? e.name : `${rel}/${e.name}`
      if (e.dir) {
        if (depth < KNOWLEDGE_LIMITS.maxSectionDepth) {
          folders.push(child)
          queue.push({ rel: child, depth: depth + 1 })
        }
        continue
      }
      if (!e.file) continue
      if (found.length >= KNOWLEDGE_LIST_MAX_FILES) {
        truncated = true
        break
      }
      try {
        const stat = fs.lstatSync(path.join(dir, e.name))
        if (stat.isFile()) found.push({ page: child, size: stat.size, modifiedAt: stat.mtime.toISOString() })
      } catch {
        // Gone since it was listed.
      }
    }
  }
  return { found, folders, truncated }
}

/** The page's listing, read through the verified open; null for a file that cannot be read as text. */
function itemise(sys: FdPaths, root: string, f: Found, exists: ReadonlySet<string>): KnowledgePageListing | null {
  const base = { page: f.page, size: f.size, modifiedAt: f.modifiedAt }
  if (f.size > MAX_FILE_BYTES) {
    return {
      ...base, title: titleFromPageName(f.page), description: '', tags: [], properties: {}, version: '',
      problems: [knowledgeProblem.tooLarge(f.size)],
    }
  }
  const read = readTextFile(sys, path.join(root, f.page))
  if (!read.ok) return null
  const text = Buffer.from(read.bytes).toString('utf8')
  const checked = checkPageForListing(f.page, text, { pageExists: (level, page) => (level === null ? exists.has(page) : undefined) })
  return {
    ...base,
    ...checked.summary,
    version: versionOf(read.bytes),
    problems: checked.problems,
  }
}

export function itemiseKnowledge(owner: KnowledgeOwnerRef, sys: FdPaths = systemFdPaths()): LocationListKnowledgeResult {
  const folder = pagesFolderOf(owner)
  if (folder.kind === 'unsafe') outside(owner)
  if (folder.kind === 'none') return { files: [], truncated: false, sections: [], pages: [] }
  const real = folder.real
  const { found, folders, truncated } = walk(sys, real, owner)
  const exists = new Set(found.map(f => f.page))
  const pages: KnowledgePageListing[] = []
  for (const f of found) {
    const listing = itemise(sys, real, f, exists)
    if (listing) pages.push(listing)
  }
  pages.sort((a, b) => (a.page < b.page ? -1 : a.page > b.page ? 1 : 0))
  const count = new Map<string, number>()
  for (const p of pages) {
    const slash = p.page.lastIndexOf('/')
    if (slash >= 0) count.set(p.page.slice(0, slash), (count.get(p.page.slice(0, slash)) ?? 0) + 1)
  }
  const sections: KnowledgeSection[] = folders.sort().map(p => ({ path: p, pageCount: count.get(p) ?? 0 }))
  const files: OwnerFolderFile[] = pages
    .map(p => ({ path: p.page, size: p.size, modifiedAt: p.modifiedAt }))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.path.localeCompare(b.path))
  return { files, truncated, sections, pages }
}
