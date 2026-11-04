/**
 * The daily pruning job against an in-memory stand-in for the version store: 30 days and the last 20, a deleted page
 * 30 days, 200 MB an owner oldest first, and one owner failing without stopping the rest.
 */
import { describe, it, expect, vi } from 'vitest'
import type { KnowledgeOwnerRef, KnowledgeVersion } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import { pruneOwner, pruneAll, type PruningStore } from '../pruning'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-06-01T00:00:00.000Z')
const owner: KnowledgeOwnerRef = { ownerType: 'project', ownerId: 'proj-1' }

let seq = 0
function version(page: string, daysAgo: number, over: Partial<KnowledgeVersion> = {}): KnowledgeVersion {
  return {
    page, id: `v${++seq}`, version: 'h', savedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    size: 100, change: 'edited', deleted: false, ...over,
  }
}

function memoryStore(all: KnowledgeVersion[]): PruningStore & { left: () => KnowledgeVersion[]; removedIds: string[] } {
  const removedIds: string[] = []
  const live = () => all.filter(v => !removedIds.includes(v.id))
  return {
    removedIds,
    left: live,
    listVersions: async (_o, page) => ({ versions: live().filter(v => v.page === page) }),
    listDeleted: async () => ({ versions: live().filter(v => v.deleted && !live().some(w => w.page === v.page && !w.deleted && Date.parse(w.savedAt) > Date.parse(v.savedAt))) }),
    listVersionedPages: async () => [...new Set(live().map(v => v.page))],
    listKnowledgeOwners: async () => [owner],
    removeVersion: async (_o, _page, id) => { removedIds.push(id); return true },
    versionStats: async () => ({ totalBytes: live().reduce((n, v) => n + v.size, 0) }),
  }
}

const opts = { now: NOW }

describe('pruning kept versions @SC-1389', () => {
  it('removes versions older than 30 days that are past the last 20, and keeps the rest', async () => {
    // Three recent versions, then 22 between 19 and 82 days old: the newest 20 stay, and of the other five (70 to 82
    // days) all are past 30 days.
    const all = Array.from({ length: 25 }, (_, i) => version('a.md', i < 3 ? i : 10 + i * 3))
    const store = memoryStore(all)
    const out = await pruneOwner(store, owner, opts)
    expect(out.removed).toBe(5)
    expect(store.left()).toHaveLength(20)
  })

  it('always keeps the last 20, however old', async () => {
    const all = Array.from({ length: 30 }, (_, i) => version('a.md', 100 + i))
    const store = memoryStore(all)
    const out = await pruneOwner(store, owner, opts)
    expect(store.left()).toHaveLength(20)
    expect(out.removed).toBe(10)
    const newest = [...all].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)).slice(0, 20).map(v => v.id)
    expect(store.left().map(v => v.id).sort()).toEqual(newest.sort())
  })

  it('keeps versions under 30 days even past the last 20', async () => {
    const all = Array.from({ length: 24 }, (_, i) => version('a.md', i))
    const store = memoryStore(all)
    await pruneOwner(store, owner, opts)
    expect(store.left()).toHaveLength(24)
  })

  it('removes a page deleted over 30 days ago with all its versions, and keeps a recent deletion', async () => {
    const old = [version('old.md', 40), version('old.md', 50, { change: 'edited' }), version('old.md', 40, { deleted: true, change: 'deleted' })]
    const recent = [version('recent.md', 40), version('recent.md', 5, { deleted: true, change: 'deleted' })]
    const store = memoryStore([...old, ...recent])
    await pruneOwner(store, owner, opts)
    expect(store.left().every(v => v.page === 'recent.md')).toBe(true)
    // The recent deletion's older version is past 30 days but within the last 20, so it stays too.
    expect(store.left()).toHaveLength(2)
  })

  it('does not treat a page that has come back as deleted', async () => {
    const all = [version('a.md', 40, { deleted: true, change: 'deleted' }), version('a.md', 1)]
    const store = memoryStore(all)
    await pruneOwner(store, owner, opts)
    expect(store.left()).toHaveLength(2)
  })

  it('removes nothing of a page that came back after the expired list was taken (F-site-18-01)', async () => {
    const all = [version('a.md', 50), version('a.md', 40, { deleted: true, change: 'deleted' })]
    const base = memoryStore(all)
    let listed = 0
    const store: PruningStore = {
      ...base,
      // The first look sees the page deleted; by the second it has been written again.
      listDeleted: async o => (listed++ === 0 ? base.listDeleted(o) : { versions: [] }),
    }
    const out = await pruneOwner(store, owner, opts)
    expect(out.removed).toBe(0)
    expect(base.left()).toHaveLength(2)
  })

  it('holds an owner to 200 MB, removing the oldest first', async () => {
    const MB = 1024 * 1024
    const all = [
      version('a.md', 1, { size: 100 * MB }),
      version('a.md', 2, { size: 100 * MB }),
      version('b.md', 3, { size: 100 * MB }),
      version('b.md', 4, { size: 50 * MB }),
    ]
    const store = memoryStore(all)
    const out = await pruneOwner(store, owner, opts)
    expect(store.left().map(v => v.size / MB).sort()).toEqual([100, 100])
    expect(store.removedIds).toEqual([all[3].id, all[2].id])
    expect(out.removed).toBe(2)
    expect(out.bytesFreed).toBe(150 * MB)
  })

  it('removes nothing from an owner within every rule', async () => {
    const store = memoryStore([version('a.md', 1), version('a.md', 2)])
    expect(await pruneOwner(store, owner, opts)).toEqual({ removed: 0, bytesFreed: 0 })
  })
})

describe('the job over every owner @SC-1389', () => {
  it('carries on when one owner fails, and removes under the page lock', async () => {
    const seen: string[] = []
    const bad: KnowledgeOwnerRef = { ownerType: 'user', ownerId: 'u-bad' }
    const good: KnowledgeOwnerRef = { ownerType: 'user', ownerId: 'u-good' }
    const store: PruningStore = {
      ...memoryStore([]),
      listKnowledgeOwners: async () => [bad, good],
      listDeleted: async (o) => {
        seen.push(o.ownerId)
        if (o.ownerId === 'u-bad') throw new Error('disk trouble')
        return { versions: [] }
      },
    }
    await pruneAll(store, opts)
    expect(seen).toEqual(['u-bad', 'u-good'])
  })
})
