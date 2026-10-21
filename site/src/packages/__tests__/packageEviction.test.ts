import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { selectEvictions, packageCacheMaxBytes, evictPackages, DEFAULT_PACKAGE_CACHE_MAX_BYTES, PACKAGE_EVICTION_GRACE_MS } from '../packageEviction'
import { storeVerifiedPackage, hasPackage, listCachedPackages, packageDir } from '../packageCache'
import { handlePackagesMissing } from '../packageMethods'
import { makeTransfer } from './transferFixture'
import type { CachedPackage } from '../packageCache'

const c = (name: string, bytes: number, lastUsedMs: number): CachedPackage => ({
  digest: name.padEnd(64, '0'), dir: `/cache/${name}`, bytes, lastUsedMs,
})

/** Backdates every entry's mtime past PACKAGE_EVICTION_GRACE_MS, so a
 *  freshly-stored entry in a test doesn't sit protected by its own grace. */
async function ageAllPastGrace(transfers: Array<{ ref: Parameters<typeof packageDir>[0] }>): Promise<void> {
  const old = new Date(Date.now() - PACKAGE_EVICTION_GRACE_MS - 60_000)
  for (const { ref } of transfers) {
    await fs.utimes(path.join(packageDir(ref), 'package.json'), old, old)
  }
}

describe('eviction policy', () => {
  it('reads PACKAGE_CACHE_MAX_BYTES, defaulting to 512 MiB', () => {
    expect(DEFAULT_PACKAGE_CACHE_MAX_BYTES).toBe(536870912)
    expect(packageCacheMaxBytes({})).toBe(536870912)
    expect(packageCacheMaxBytes({ PACKAGE_CACHE_MAX_BYTES: '1000' })).toBe(1000)
    expect(packageCacheMaxBytes({ PACKAGE_CACHE_MAX_BYTES: 'lots' })).toBe(536870912)
  })

  it('evicts nothing while the cache is within its limit, however old the entries', () => {
    const cached = [c('a', 10, 1), c('b', 10, 2), c('c', 10, 3)]
    expect(selectEvictions(cached, new Set(), 1e9)).toEqual([])
  })

  it('never evicts a protected entry, however old', () => {
    const cached = [c('a', 100, 1), c('b', 100, 2)]
    expect(selectEvictions(cached, new Set([cached[0].digest]), 150).map(x => x.dir)).toEqual(['/cache/b'])
  })

  it('evicts least recently used entries while the cache is over its limit', () => {
    const cached = [c('a', 100, 50), c('b', 100, 10), c('c', 100, 30)]
    expect(selectEvictions(cached, new Set(), 150).map(x => x.dir)).toEqual(['/cache/b', '/cache/c'])
    expect(selectEvictions(cached, new Set([cached[1].digest]), 150).map(x => x.dir)).toEqual(['/cache/c', '/cache/a'])
  })

  // An entry used or stored within the grace window is never evicted,
  // closing the race between hq delivering or re-confirming content and the
  // AgentRun row that would otherwise protect it (which may not exist yet, or
  // — for a prompt preview — ever).
  it('skips an entry within the grace window even though it is the least recently used', () => {
    const now = 10_000_000
    const cached = [c('a', 100, now - 1000), c('b', 100, now - PACKAGE_EVICTION_GRACE_MS - 1000)]
    expect(selectEvictions(cached, new Set(), 1, now).map(x => x.dir)).toEqual(['/cache/b'])
  })
})

describe('evictPackages', () => {
  let root: string
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-')); process.env.SITE_ROOT = root })
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

  it('removes the selected entries from disk, least recently used first', async () => {
    const v1 = makeTransfer('agent', 'a1', { 'instructions.md': '1' })
    const v2 = makeTransfer('agent', 'a1', { 'instructions.md': '2' })
    for (const v of [v1, v2]) await storeVerifiedPackage(v.ref, v.body)
    // Freshly stored entries are within their own eviction grace — age them past it.
    await ageAllPastGrace([v1, v2])
    const older = new Date(Date.now() - PACKAGE_EVICTION_GRACE_MS - 120_000)
    await fs.utimes(path.join(packageDir(v1.ref), 'package.json'), older, older)
    const oneEntry = (await listCachedPackages())[0].bytes
    expect(await evictPackages(new Set(), oneEntry)).toBe(1)
    expect(await hasPackage(v1.ref)).toBe(false)
    expect(await hasPackage(v2.ref)).toBe(true)
  })

  // A previous version of this test never forced fs.rm to actually fail, so
  // it passed unchanged against the earlier (rm-in-place) code too — it
  // proved nothing about the rename-then-delete
  // behaviour. This one forces the delete of the STAGED copy to reject once,
  // then checks the specific guarantee: the entry is already gone from its
  // original, readable location (the rename already happened), while the
  // staged copy is left behind for a later `.incoming` sweep to clean up.
  it('an interrupted delete leaves the staged copy behind, but the entry is already gone from its readable location', async () => {
    const v1 = makeTransfer('agent', 'a1', { 'instructions.md': '1' })
    await storeVerifiedPackage(v1.ref, v1.body)
    await ageAllPastGrace([v1])

    const original = packageDir(v1.ref)
    const realRm = fs.rm.bind(fs)
    let stagedPath: string | null = null
    const spy = vi.spyOn(fs, 'rm').mockImplementation(async (target: any, options?: any) => {
      if (typeof target === 'string' && target.includes(`${path.sep}.incoming${path.sep}evict-`)) {
        stagedPath = target
        spy.mockRestore()
        throw new Error('simulated interrupted delete')
      }
      return realRm(target, options)
    })

    expect(await evictPackages(new Set(), 0)).toBe(1)

    expect(stagedPath).not.toBeNull()
    await expect(fs.access(original)).rejects.toThrow()
    expect(await hasPackage(v1.ref)).toBe(false)
    expect((await listCachedPackages()).some(p => p.digest === v1.ref.digest)).toBe(false)
    // The staged copy survives the failed delete — later cleaned up by sweepIncomingDir.
    await expect(fs.access(stagedPath!)).resolves.toBeUndefined()
  })

  // Content hq just re-confirmed via packages.missing, or just stored via
  // packages.put, must survive an eviction sweep even when the cache is
  // over its size cap and no AgentRun row protects it yet.
  it('content just confirmed by packages.missing survives a sweep over the size cap', async () => {
    const a = makeTransfer('agent', 'a1', { 'instructions.md': 'x'.repeat(50) })
    const b = makeTransfer('agent', 'a1', { 'instructions.md': 'y'.repeat(50) })
    await storeVerifiedPackage(a.ref, a.body)
    await storeVerifiedPackage(b.ref, b.body)
    // Age both past the grace window so eviction would otherwise take both under a tiny budget.
    const old = new Date(Date.now() - PACKAGE_EVICTION_GRACE_MS - 60_000)
    await fs.utimes(path.join(packageDir(a.ref), 'package.json'), old, old)
    await fs.utimes(path.join(packageDir(b.ref), 'package.json'), old, old)

    // hq re-confirms it still needs this content ahead of a dispatch or resume —
    // this must renew its grace even though no run row exists yet to protect it.
    await handlePackagesMissing({ refs: [a.ref] })

    expect(await evictPackages(new Set(), 1)).toBe(1)
    expect(await hasPackage(a.ref)).toBe(true)
    expect(await hasPackage(b.ref)).toBe(false)
  })

  it('just-stored content survives a sweep over the size cap', async () => {
    const a = makeTransfer('agent', 'a1', { 'instructions.md': 'x'.repeat(50) })
    await storeVerifiedPackage(a.ref, a.body)
    // No aging — freshly stored, so its mtime is already within the grace window.
    expect(await evictPackages(new Set(), 1)).toBe(0)
    expect(await hasPackage(a.ref)).toBe(true)
  })

  it('content older than the grace window is evictable', async () => {
    const a = makeTransfer('agent', 'a1', { 'instructions.md': 'x'.repeat(50) })
    await storeVerifiedPackage(a.ref, a.body)
    const old = new Date(Date.now() - PACKAGE_EVICTION_GRACE_MS - 60_000)
    await fs.utimes(path.join(packageDir(a.ref), 'package.json'), old, old)
    expect(await evictPackages(new Set(), 1)).toBe(1)
    expect(await hasPackage(a.ref)).toBe(false)
  })

  // removeEntry now throws on a non-ENOENT rename failure — without
  // per-entry isolation, one bad candidate (a permissions error, a busy
  // handle) would abort the rest of the pass every sweep and could keep the
  // cache over its cap indefinitely. Each candidate must be tried
  // independently, and the returned count must reflect only what was
  // actually removed.
  it('a candidate that fails to rename does not abort the rest of the pass, and is excluded from the returned count', async () => {
    const aOld = makeTransfer('agent', 'a1', { 'instructions.md': 'a' })
    const bOld = makeTransfer('agent', 'b1', { 'instructions.md': 'b' })
    const all = [aOld, bOld]
    for (const v of all) await storeVerifiedPackage(v.ref, v.body)
    await ageAllPastGrace(all)

    // Two evictable candidates (a zero budget takes both) — make the rename for
    // ONE of them fail with a non-ENOENT error, simulating a real failure
    // (e.g. a permissions problem) rather than a benign concurrent eviction.
    const failingDir = packageDir(aOld.ref)
    const realRename = fs.rename.bind(fs)
    const spy = vi.spyOn(fs, 'rename').mockImplementation(async (src: any, dest: any) => {
      if (src === failingDir) throw Object.assign(new Error('simulated permission failure'), { code: 'EACCES' })
      return realRename(src, dest)
    })

    let removed: number
    try {
      removed = await evictPackages(new Set(), 0)
    } finally {
      spy.mockRestore()
    }

    expect(removed).toBe(1)
    expect(await hasPackage(aOld.ref)).toBe(true) // the failing candidate is untouched, not half-removed
    expect(await hasPackage(bOld.ref)).toBe(false) // the other candidate was still evicted
  })
})
