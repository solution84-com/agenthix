/**
 * The daily pruning job (spec, *Versions and pruning*): a page's kept versions stay 30 days and its last 20 always;
 * a deleted page stays 30 days; each owner's versions together are held to 200 MB, oldest removed first.
 *
 * It works only through the version store (`./versionStore.ts`), which alone knows how versions are laid out, and
 * never touches a current page. One owner failing is logged and does not stop the others.
 */
import type { KnowledgeOwnerRef, KnowledgeVersion } from '@agenthix/core'
import { withPageLock } from './pageLock'
import * as versionStore from './versionStore'
import { Logger } from '../utils/logger'

const logger = new Logger('knowledge-pruning')
const DAY_MS = 24 * 60 * 60 * 1000
const KEEP_DAYS = 30
const KEEP_LAST = 20
const CAP_BYTES = 200 * 1024 * 1024
const EVERY_MS = DAY_MS
const FIRST_RUN_MS = 5 * 60 * 1000

/** The version store's functions this job uses (`versionStore.ts`), so tests can stand in for it. */
export interface PruningStore {
  listVersions(owner: KnowledgeOwnerRef, page: string): Promise<{ versions: KnowledgeVersion[] }>
  listDeleted(owner: KnowledgeOwnerRef): Promise<{ versions: KnowledgeVersion[] }>
  listVersionedPages(owner: KnowledgeOwnerRef): Promise<string[]>
  listKnowledgeOwners(): Promise<KnowledgeOwnerRef[]>
  removeVersion(owner: KnowledgeOwnerRef, page: string, versionId: string): Promise<boolean>
  versionStats(owner: KnowledgeOwnerRef): Promise<{ totalBytes: number }>
}

export interface PruningOptions {
  now?: number
  keepDays?: number
  keepLast?: number
  capBytes?: number
}

export interface PruningOutcome { removed: number; bytesFreed: number }

const timeOf = (v: KnowledgeVersion) => Date.parse(v.savedAt)

export async function pruneOwner(
  store: PruningStore,
  owner: KnowledgeOwnerRef,
  options: PruningOptions = {},
): Promise<PruningOutcome> {
  const now = options.now ?? Date.now()
  const maxAge = (options.keepDays ?? KEEP_DAYS) * DAY_MS
  const keepLast = options.keepLast ?? KEEP_LAST
  const cap = options.capBytes ?? CAP_BYTES
  const outcome: PruningOutcome = { removed: 0, bytesFreed: 0 }
  const count = (v: KnowledgeVersion) => { outcome.removed++; outcome.bytesFreed += v.size }
  // Under the page's lock, so a removal never races a restore of the same version.
  const remove = async (v: KnowledgeVersion) => {
    if (await withPageLock(owner, v.page, () => store.removeVersion(owner, v.page, v.id))) count(v)
  }
  // A deleted page's versions all go together, in one hold of its lock, and only if it is still deleted then: it may
  // have been restored or written again since the list of expired pages was taken, and its history is then not ours to remove.
  const removeDeletedPage = (page: string) => withPageLock(owner, page, async () => {
    const stillExpired = (await store.listDeleted(owner)).versions.some(d => d.page === page && now - timeOf(d) > maxAge)
    if (!stillExpired) return false
    for (const v of (await store.listVersions(owner, page)).versions) {
      if (await store.removeVersion(owner, page, v.id)) count(v)
    }
    return true
  })

  // listDeleted names only pages that are not there now, so a page that has come back is never treated as deleted.
  const expiredDeleted = new Set(
    (await store.listDeleted(owner)).versions.filter(d => now - timeOf(d) > maxAge).map(d => d.page),
  )

  // What is left per page, after the age rules; the cap works from this.
  const remaining: KnowledgeVersion[] = []
  for (const page of await store.listVersionedPages(owner)) {
    if (expiredDeleted.has(page) && await removeDeletedPage(page)) continue
    const versions = [...(await store.listVersions(owner, page)).versions].sort((a, b) => timeOf(b) - timeOf(a))
    for (const [i, v] of versions.entries()) {
      if (i >= keepLast && now - timeOf(v) > maxAge) await remove(v)
      else remaining.push(v)
    }
  }

  let total = (await store.versionStats(owner)).totalBytes
  if (total > cap) {
    for (const v of remaining.sort((a, b) => timeOf(a) - timeOf(b))) {
      if (total <= cap) break
      await remove(v)
      total -= v.size
    }
  }
  return outcome
}

export async function pruneAll(store: PruningStore = versionStore, options: PruningOptions = {}): Promise<PruningOutcome> {
  const total: PruningOutcome = { removed: 0, bytesFreed: 0 }
  for (const owner of await store.listKnowledgeOwners()) {
    try {
      const r = await pruneOwner(store, owner, options)
      total.removed += r.removed
      total.bytesFreed += r.bytesFreed
    } catch (err) {
      logger.warn(`Could not prune the versions of ${owner.ownerType} ${owner.ownerId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (total.removed > 0) logger.info(`Pruned ${total.removed} kept knowledge version(s), ${total.bytesFreed} bytes.`)
  return total
}

/** Runs the job once a day while the site is up; the timer does not keep the process alive. */
export function startKnowledgePruning(store: PruningStore = versionStore): NodeJS.Timeout {
  // A site restarted more often than daily would never prune, so it also runs once soon after it starts.
  setTimeout(() => { void pruneAll(store) }, FIRST_RUN_MS).unref()
  return setInterval(() => { void pruneAll(store) }, EVERY_MS).unref()
}
