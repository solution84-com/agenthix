// @vitest-environment node
/** Kept versions on the disk, and the functions the daily pruning job removes them through. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writePage, deletePage } from '../gate'
import {
  VERSION_ID, listDeleted, listKnowledgeOwners, listVersionedPages, listVersions, newVersionId, removeVersion,
  savedAtOf, versionStats,
} from '../versionStore'
import { org, page, project, useSiteRoot } from './knowledgeFixtures'

const site = useSiteRoot()
beforeEach(site.setUp)
afterEach(site.tearDown)

async function twoVersions(name: string) {
  const a = await writePage(project, { page: name, content: page('One'), baseVersion: null })
  const b = await writePage(project, { page: name, content: page('Two'), baseVersion: a.outcome === 'done' ? a.version! : '' })
  const c = await writePage(project, { page: name, content: page('Three'), baseVersion: b.outcome === 'done' ? b.version! : '' })
  return [b, c].map(r => (r.outcome === 'done' ? r.previousVersionId! : ''))
}

describe('version ids @SC-1388', () => {
  it('are the UTC time to the millisecond and 8 hex, and sort by time', () => {
    const id = newVersionId([], Date.UTC(2026, 9, 25, 14, 3, 9, 7))
    expect(id).toMatch(VERSION_ID)
    expect(id.startsWith('20261025T140309007Z-')).toBe(true)
    expect(savedAtOf(id)).toBe('2026-10-25T14:03:09.007Z')
  })

  it('stay later than the newest kept one, even within one millisecond or with a clock behind', () => {
    const first = newVersionId([], Date.UTC(2026, 9, 25))
    const second = newVersionId([first], Date.UTC(2026, 9, 25))
    const third = newVersionId([first, second], Date.UTC(2026, 9, 24))
    expect([first, second, third]).toEqual([first, second, third].sort())
    expect(new Set([first, second, third]).size).toBe(3)
  })
})

describe('what pruning works with', () => {
  it('lists the pages that have versions, in any section @SC-1389', async () => {
    await twoVersions('a.md')
    await twoVersions('processes/deep/b.md')
    expect((await listVersionedPages(project)).sort()).toEqual(['a.md', 'processes/deep/b.md'])
  })

  it('removes one version for good, and answers false for one not there or not an id @SC-1389', async () => {
    const [older, newer] = await twoVersions('a.md')
    expect(await removeVersion(project, 'a.md', older)).toBe(true)
    expect((await listVersions(project, 'a.md')).versions.map(v => v.id)).toEqual([newer])
    expect(await removeVersion(project, 'a.md', older)).toBe(false)
    expect(await removeVersion(project, 'a.md', '../../pages/a.md')).toBe(false)
  })

  it('removes a deleted page out of Recently deleted with its marker @SC-1388', async () => {
    await twoVersions('a.md')
    const deleted = await deletePage(project, { page: 'a.md' })
    const [gone] = (await listDeleted(project)).versions
    expect(deleted.outcome === 'done' && deleted.previousVersionId).toBe(gone.id)
    await removeVersion(project, 'a.md', gone.id)
    expect((await listDeleted(project)).versions).toEqual([])
  })

  it('counts the bytes an owner\'s versions take @SC-1389', async () => {
    expect(await versionStats(project)).toEqual({ totalBytes: 0 })
    await twoVersions('a.md')
    const { versions } = await listVersions(project, 'a.md')
    expect((await versionStats(project)).totalBytes).toBe(versions.reduce((n, v) => n + v.size, 0))
  })

  it('lists every owner with knowledge on this site @SC-1389', async () => {
    await twoVersions('a.md')
    await writePage(org, { page: 'brand.md', content: page('Brand'), baseVersion: null })
    expect(await listKnowledgeOwners()).toEqual(expect.arrayContaining([project, org]))
  })
})
