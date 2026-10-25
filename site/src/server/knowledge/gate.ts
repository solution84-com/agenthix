/**
 * The gate (agent knowledge spec, part 2; ADR-0151): the one way a knowledge page changes. Each change is applied to
 * the current page (G2), the result checked against T1–T4 by core's `checkPageChange` (G3), and then swapped in (G4):
 * the current page is kept whole as a version, and the new one renamed into place by the file tools' `write`, so a
 * reader sees the old page or the new one and never half of either. One change at a time per page (`./pageLock.ts`).
 *
 * A refusal is an answer (`KnowledgeChangeResult`), not a failure: it says what is wrong and ends saying nothing was
 * changed. A name that leads outside the owner's pages, or through a link, is thrown as a `KnowledgeFileRefusal`,
 * which the channel methods turn into a `LocationFileError`. Who made a change is hq's to record (G5); the site
 * answers what changed, and the version that holds what the page was before.
 */
import path from 'node:path'
import {
  KNOWLEDGE_LIMITS,
  KNOWLEDGE_PAGE_EXTENSION,
  checkPageChange,
  checkPageName,
  type KnowledgeChangeKind,
  type KnowledgeChangeResult,
  type KnowledgeOwnerRef,
  type KnowledgePageProblem,
} from '@agenthix/core'
import { applyEdit } from '@agenthix/core/file-tools'
import { knowledgePagesDir } from '../storage/paths'
import { KnowledgeFileRefusal, entriesOf, inside, readText, removeText, pruneEmptyFolders, rootExists, writeText, type PageText } from './fileAccess'
import { nameForRefusal } from './owner'
import { withPageLock } from './pageLock'
import {
  keepVersion, readVersion, removeAllVersions, removeVersionNow, type VersionCause,
} from './versionStore'

type Refusal = Extract<KnowledgeChangeResult, { outcome: 'refused' }>

const UNCHANGED = 'Nothing was changed.'

function problemsRefusal(page: string, problems: KnowledgePageProblem[]): Refusal {
  return {
    outcome: 'refused', reason: 'problems', problems,
    message: `${nameForRefusal(page)} was not saved: ${problems.map(p => p.message).join('; ')}. ${UNCHANGED}`,
  }
}

function notFound(page: string): Refusal {
  return { outcome: 'refused', reason: 'not_found', message: `There is no page ${page}. Check its name, or search for it. ${UNCHANGED}` }
}

function conflict(page: string, current: PageText): Refusal {
  return {
    outcome: 'refused', reason: 'conflict', current: { content: current.text, version: current.version },
    message: `${page} changed since it was read. Its current text is attached: make the change on what it says now. ${UNCHANGED}`,
  }
}

function alreadyThere(page: string, current: PageText): Refusal {
  return {
    outcome: 'refused', reason: 'conflict', current: { content: current.text, version: current.version },
    message: `There is already a page ${page}. Read it, then change it. ${UNCHANGED}`,
  }
}

function notUnique(page: string, found: number): Refusal {
  const message = found === 0
    ? `old_string was not found in ${page}. Read the page again and copy the passage exactly, with its spaces and line breaks. ${UNCHANGED}`
    : `old_string was found ${found} times in ${page}. Give more of the text around it so it is found once, or set replace_all. ${UNCHANGED}`
  return { outcome: 'refused', reason: 'not_unique', found, message }
}

function noChange(page: string): Refusal {
  return { outcome: 'refused', reason: 'no_change', message: `${page} already says exactly that, so there is nothing to change. ${UNCHANGED}` }
}

/** The name's problems under T1, before anything is looked up by it. */
function nameRefusal(page: string): Refusal | null {
  const problems = checkPageName(page)
  return problems.length ? problemsRefusal(page, problems) : null
}

/** How many pages the owner holds, counted up to the most a place may hold. */
function countPages(owner: KnowledgeOwnerRef): number {
  const root = knowledgePagesDir(owner)
  if (!rootExists(root)) return 0
  let count = 0
  const walk = (dir: string, depth: number) => {
    for (const d of entriesOf(dir)) {
      if (count >= KNOWLEDGE_LIMITS.maxPages) return
      if (d.isFile() && d.name.endsWith(KNOWLEDGE_PAGE_EXTENSION)) count++
      else if (d.isDirectory() && depth < KNOWLEDGE_LIMITS.maxSectionDepth) walk(path.join(dir, d.name), depth + 1)
    }
  }
  walk(inside(root, ''), 0)
  return count
}

/**
 * G3 and G4 for a page whose new text is known: check it, keep what it held as a version, swap the new text in.
 * `current` is what the page holds now, read under the page's lock; null when it is not there.
 */
function checkAndSwap(
  owner: KnowledgeOwnerRef, page: string, current: PageText | null, text: string, cause: VersionCause, change: KnowledgeChangeKind,
): KnowledgeChangeResult {
  if (current && current.text === text) return noChange(page)
  const creating = current === null
  const checked = checkPageChange(page, text, creating ? { creating, pagesInPlace: countPages(owner) } : {})
  if (checked.problems.length) return problemsRefusal(page, checked.problems)

  const root = knowledgePagesDir(owner)
  const previousVersionId = current ? keepVersion(owner, page, current.text, cause) : undefined
  try {
    const version = writeText(root, page, text, current ? current.version : null)
    return { outcome: 'done', page, change, version, ...(previousVersionId ? { previousVersionId } : {}) }
  } catch (err) {
    if (previousVersionId) removeVersionNow(owner, page, previousVersionId)
    const now = err instanceof KnowledgeFileRefusal && (err.reason === 'changed' || err.reason === 'exists') ? readText(root, page) : null
    if (now) return conflict(page, now)
    throw err
  }
}

export interface WritePage { page: string; content: string; baseVersion: string | null; movedFrom?: string }

/** A whole page, made from the version it started from (G2); a page changed since is refused with its text. */
export function writePage(owner: KnowledgeOwnerRef, change: WritePage): Promise<KnowledgeChangeResult> {
  return withPageLock(owner, change.page, () => {
    const bad = nameRefusal(change.page) ?? (change.movedFrom !== undefined ? nameRefusal(change.movedFrom) : null)
    if (bad) return bad
    const current = readText(knowledgePagesDir(owner), change.page)
    if (change.baseVersion === null && current) return alreadyThere(change.page, current)
    if (change.baseVersion !== null && !current) return notFound(change.page)
    if (current && change.baseVersion !== current.version) return conflict(change.page, current)
    const kind: KnowledgeChangeKind = change.movedFrom !== undefined ? 'moved' : current ? 'edited' : 'created'
    return checkAndSwap(owner, change.page, current, change.content, 'edited', kind)
  })
}

export interface EditPage { page: string; old_string: string; new_string: string; replace_all?: boolean }

/** A passage replaced by exact matching, found exactly once unless `replace_all` (G2). */
export function editPage(owner: KnowledgeOwnerRef, change: EditPage): Promise<KnowledgeChangeResult> {
  return withPageLock(owner, change.page, () => {
    const bad = nameRefusal(change.page)
    if (bad) return bad
    const current = readText(knowledgePagesDir(owner), change.page)
    if (!current) return notFound(change.page)
    const edited = applyEdit(current.text, change)
    if (!edited.ok) {
      if (edited.reason === 'edit-no-change') return noChange(change.page)
      if (edited.reason === 'edit-not-found' || edited.reason === 'edit-ambiguous') return notUnique(change.page, edited.count ?? 0)
      throw new KnowledgeFileRefusal(edited.reason)
    }
    return checkAndSwap(owner, change.page, current, edited.text, 'edited', 'edited')
  })
}

export interface DeletePage { page: string; movedTo?: string }

/** The page moved into its versions, marked deleted: Recently deleted, until pruned or restored. */
export function deletePage(owner: KnowledgeOwnerRef, change: DeletePage): Promise<KnowledgeChangeResult> {
  return withPageLock(owner, change.page, () => {
    const bad = nameRefusal(change.page) ?? (change.movedTo !== undefined ? nameRefusal(change.movedTo) : null)
    if (bad) return bad
    const root = knowledgePagesDir(owner)
    const current = readText(root, change.page)
    if (!current) return notFound(change.page)
    const kind = change.movedTo !== undefined ? 'moved' : 'deleted'
    const previousVersionId = keepVersion(owner, change.page, current.text, kind)
    try {
      removeText(root, change.page)
    } catch (err) {
      removeVersionNow(owner, change.page, previousVersionId)
      throw err
    }
    pruneEmptyFolders(root, change.page)
    return { outcome: 'done', page: change.page, change: kind, previousVersionId }
  })
}

/** Removed at once and for good: the page and every version of it, or, with `versionId`, that one version. */
export function deletePermanently(owner: KnowledgeOwnerRef, change: { page: string; versionId?: string }): Promise<KnowledgeChangeResult> {
  return withPageLock(owner, change.page, () => {
    const bad = nameRefusal(change.page)
    if (bad) return bad
    if (change.versionId !== undefined) {
      if (!removeVersionNow(owner, change.page, change.versionId)) return noSuchVersion(change.page)
      return { outcome: 'done', page: change.page, change: 'deleted' }
    }
    const root = knowledgePagesDir(owner)
    const hadPage = rootExists(root) && removeText(root, change.page)
    if (hadPage) pruneEmptyFolders(root, change.page)
    const hadVersions = removeAllVersions(owner, change.page) > 0
    if (!hadPage && !hadVersions) return notFound(change.page)
    return { outcome: 'done', page: change.page, change: 'deleted' }
  })
}

function noSuchVersion(page: string): Refusal {
  return { outcome: 'refused', reason: 'not_found', message: `${page} has no such earlier version. List its history to see the ones kept. ${UNCHANGED}` }
}

/** A kept version saved back as the page, through the same checks, as a new version. Restores a deleted page too. */
export function restorePage(owner: KnowledgeOwnerRef, change: { page: string; versionId: string }): Promise<KnowledgeChangeResult> {
  return withPageLock(owner, change.page, () => {
    const bad = nameRefusal(change.page)
    if (bad) return bad
    const kept = readVersion(owner, change.page, change.versionId)
    if (!kept) return noSuchVersion(change.page)
    const current = readText(knowledgePagesDir(owner), change.page)
    return checkAndSwap(owner, change.page, current, kept.text, 'restored', 'restored')
  })
}
