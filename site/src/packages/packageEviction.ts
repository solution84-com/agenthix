/**
 * Cache eviction. Never content a pending or running run uses — no package is
 * bound into a container, since every package file is read or staged when a run
 * launches (ruling T1). Beyond that: evict the least recently used entries while
 * the cache is over PACKAGE_CACHE_MAX_BYTES. Content an edit in hq replaced is
 * simply no longer used, so it ages out the same way.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { listCachedPackages, getPackageCacheRoot, INCOMING_DIR, type CachedPackage } from './packageCache'
import { Logger } from '../server/utils/logger'

const logger = new Logger('PackageEviction')

export const DEFAULT_PACKAGE_CACHE_MAX_BYTES = 512 * 1024 * 1024

export function packageCacheMaxBytes(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.PACKAGE_CACHE_MAX_BYTES)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_PACKAGE_CACHE_MAX_BYTES
}

/**
 * Content used or stored this recently is never evicted, protected or not.
 * Closes the race between hq delivering content (`packages.put`) or
 * re-confirming it (`packages.missing`) and the AgentRun
 * row that would otherwise protect it — that row may not exist yet (a
 * dispatch or a resume not yet past PENDING) or may never exist at all (a
 * prompt preview). `PACKAGE_CACHE_MAX_BYTES` eviction runs on every put and on
 * a periodic sweep, so this window is real, not theoretical.
 */
export const PACKAGE_EVICTION_GRACE_MS = 5 * 60_000

function withinGrace(entry: CachedPackage, now: number): boolean {
  return now - entry.lastUsedMs < PACKAGE_EVICTION_GRACE_MS
}

export function selectEvictions(cached: CachedPackage[], protectedDigests: ReadonlySet<string>, maxBytes: number, now: number = Date.now()): CachedPackage[] {
  const evict = new Set<CachedPackage>()
  let total = cached.reduce((sum, entry) => sum + entry.bytes, 0)
  const byLeastRecentUse = cached
    .filter(entry => !protectedDigests.has(entry.digest) && !withinGrace(entry, now))
    .sort((a, b) => a.lastUsedMs - b.lastUsedMs)
  for (const entry of byLeastRecentUse) {
    if (total <= maxBytes) break
    evict.add(entry)
    total -= entry.bytes
  }
  return [...evict]
}

/**
 * Removes a chosen entry by first renaming its directory out of place, into
 * `.incoming/evict-<uuid>`, and only then deleting it — so a delete crashing
 * mid-way never leaves an entry directory that exists but lacks
 * `package.json`: `hasPackage`
 * would keep reporting it present until the rm actually reaches the
 * `package.json` file, which a partial delete can remove first, leaving a
 * cache entry that `listCachedPackages` still lists but a run can no longer
 * read from cleanly. A staged copy an interrupted delete leaves behind is
 * cleaned up later by `sweepIncomingDir`.
 */
async function removeEntry(dir: string): Promise<void> {
  const staged = path.join(getPackageCacheRoot(), INCOMING_DIR, `evict-${randomUUID()}`)
  await fs.mkdir(path.dirname(staged), { recursive: true })
  try {
    await fs.rename(dir, staged)
  } catch (err) {
    // ENOENT on the source means a concurrent evictor already moved it —
    // nothing left to remove. Any other error (permissions, a busy handle…)
    // is real and must not be swallowed as if the entry were already gone.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
  await fs.rm(staged, { recursive: true, force: true }).catch(() => {})
}

/**
 * Each candidate is isolated: `removeEntry` now throws on a non-ENOENT
 * rename failure, and a single bad candidate — a permissions error, a busy
 * handle — must never abort the rest of the pass.
 * Left uncaught, one failure every sweep would keep the whole cache over its
 * cap indefinitely instead of shedding what it safely can. The count returned
 * is what was actually removed, not merely chosen.
 */
export async function evictPackages(protectedDigests: ReadonlySet<string>, maxBytes: number = packageCacheMaxBytes()): Promise<number> {
  const chosen = selectEvictions(await listCachedPackages(), protectedDigests, maxBytes)
  let removed = 0
  for (const entry of chosen) {
    try {
      await removeEntry(entry.dir)
      removed++
    } catch (err) {
      logger.warn(`could not evict ${entry.dir}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return removed
}
