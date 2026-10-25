// @vitest-environment node
/**
 * The gate (G1–G4, ADR-0151): every change applied, checked against T1–T4, the page it replaces kept as a version,
 * and the new one swapped in; a stale write, an edit's passage not found exactly once, and a page with problems are
 * refused with nothing stored.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { KNOWLEDGE_LIMITS, type KnowledgeChangeResult } from '@agenthix/core'
import { deletePage, deletePermanently, editPage, restorePage, writePage } from '../gate'
import { KnowledgeFileRefusal } from '../fileAccess'
import { listDeleted, listVersions } from '../versionStore'
import { knowledgePagesDir, knowledgeVersionsDir } from '../../storage/paths'
import { filesUnder, org, page, project, useSiteRoot, versionOfText } from './knowledgeFixtures'

const site = useSiteRoot()
beforeEach(site.setUp)
afterEach(site.tearDown)

const RELEASE = 'processes/release.md'
const pagesDir = () => knowledgePagesDir(project)
const onDisk = (name: string) => fs.readFile(path.join(pagesDir(), name), 'utf8')

function refused(result: KnowledgeChangeResult) {
  if (result.outcome !== 'refused') throw new Error(`expected a refusal, got ${JSON.stringify(result)}`)
  expect(result.message).toMatch(/Nothing was changed\.$/)
  return result
}

function done(result: KnowledgeChangeResult) {
  if (result.outcome !== 'done') throw new Error(`expected done, got ${JSON.stringify(result)}`)
  return result
}

async function create(name = RELEASE, text = page('Release process')) {
  return done(await writePage(project, { page: name, content: text, baseVersion: null }))
}

describe('a write (G2) @SC-1385', () => {
  it('makes a page that is not there yet, in its section', async () => {
    const result = await create()
    expect(result).toMatchObject({ page: RELEASE, change: 'created', version: versionOfText(page('Release process')) })
    expect(result.previousVersionId).toBeUndefined()
    expect(await onDisk(RELEASE)).toBe(page('Release process'))
  })

  it('replaces a page from the version it started from, keeping the old one whole as a version', async () => {
    const first = await create()
    const second = done(await writePage(project, { page: RELEASE, content: page('Release, v2'), baseVersion: first.version! }))
    expect(second.change).toBe('edited')
    expect(await onDisk(RELEASE)).toBe(page('Release, v2'))
    const { versions } = await listVersions(project, RELEASE)
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ id: second.previousVersionId, version: first.version, change: 'edited', deleted: false })
  })

  it('refuses a stale write with the current text, and stores nothing', async () => {
    const first = await create()
    done(await writePage(project, { page: RELEASE, content: page('Changed by someone else'), baseVersion: first.version! }))
    const stale = refused(await writePage(project, { page: RELEASE, content: page('Mine'), baseVersion: first.version! }))
    expect(stale.reason).toBe('conflict')
    expect(stale.current).toEqual({ content: page('Changed by someone else'), version: versionOfText(page('Changed by someone else')) })
    expect(await onDisk(RELEASE)).toBe(page('Changed by someone else'))
    expect((await listVersions(project, RELEASE)).versions).toHaveLength(1)
  })

  it('refuses making a page that is already there, with its text', async () => {
    await create()
    const again = refused(await writePage(project, { page: RELEASE, content: page('Other'), baseVersion: null }))
    expect(again.reason).toBe('conflict')
    expect(again.current?.content).toBe(page('Release process'))
  })

  it('refuses a write from a version of a page that is no longer there', async () => {
    const result = refused(await writePage(project, { page: RELEASE, content: page('x'), baseVersion: 'abc' }))
    expect(result.reason).toBe('not_found')
  })

  it('answers the first half of a move as moved', async () => {
    const moved = done(await writePage(project, { page: 'how/release.md', content: page('Release'), baseVersion: null, movedFrom: RELEASE }))
    expect(moved.change).toBe('moved')
  })
})

describe('the rules (G3) @SC-1386', () => {
  it('refuses a page with problems, in words, and stores nothing', async () => {
    const result = refused(await writePage(project, {
      page: RELEASE, content: '---\ntitle: Release\ntags: [Deploys]\n---\nBody\n', baseVersion: null,
    }))
    expect(result.reason).toBe('problems')
    expect(result.problems?.map(p => p.code)).toEqual(expect.arrayContaining(['description_missing', 'tag_invalid']))
    expect(result.message).toContain('description is missing')
    expect(await filesUnder(site.root())).toEqual([])
  })

  it('refuses a page over 64 KB', async () => {
    const big = page('Big', 'x'.repeat(KNOWLEDGE_LIMITS.maxPageBytes))
    const result = refused(await writePage(project, { page: RELEASE, content: big, baseVersion: null }))
    expect(result.problems?.map(p => p.code)).toContain('too_large')
    expect(await filesUnder(site.root())).toEqual([])
  })

  it('refuses a name that climbs out, is hidden, absolute or not Markdown, before anything is looked up', async () => {
    for (const name of ['../files/AGENTS.md', 'a/../../x.md', '.hidden.md', '/etc/passwd.md', 'notes.txt', 'a\\b.md']) {
      const result = refused(await writePage(project, { page: name, content: page('x'), baseVersion: null }))
      expect(result.reason).toBe('problems')
      expect(result.problems?.[0].code).toBe('name_invalid')
    }
    expect(await filesUnder(site.root())).toEqual([])
  })

  it('refuses a name through a link, even one that stays inside, and writes nothing where it leads', async () => {
    await create('decisions/auth.md', page('Auth'))
    await fs.symlink(site.outside(), path.join(pagesDir(), 'escape'))
    await fs.symlink(path.join(pagesDir(), 'decisions'), path.join(pagesDir(), 'alias'))
    for (const name of ['escape/x.md', 'alias/auth.md']) {
      await expect(writePage(project, { page: name, content: page('x'), baseVersion: null }))
        .rejects.toMatchObject({ reason: 'link' })
    }
    await expect(editPage(project, { page: 'alias/auth.md', old_string: 'Releases', new_string: 'R' }))
      .rejects.toBeInstanceOf(KnowledgeFileRefusal)
    expect(await fs.readdir(site.outside())).toEqual([])
  })

  it('refuses a page that is itself a link', async () => {
    await fs.mkdir(pagesDir(), { recursive: true })
    await fs.writeFile(path.join(site.outside(), 'secret.md'), page('Secret'))
    await fs.symlink(path.join(site.outside(), 'secret.md'), path.join(pagesDir(), 'secret.md'))
    await expect(editPage(project, { page: 'secret.md', old_string: 'Secret', new_string: 'Mine' }))
      .rejects.toMatchObject({ reason: 'link' })
    expect(await fs.readFile(path.join(site.outside(), 'secret.md'), 'utf8')).toBe(page('Secret'))
  })

  it('keeps properties exactly as written', async () => {
    const text = page('Monorepo', 'Body\n', 'status: accepted\ndate: 2026-10-20\nsupersedes: 0001-two-repos\n')
    await create('decisions/0002-monorepo.md', text)
    expect(await onDisk('decisions/0002-monorepo.md')).toBe(text)
  })
})

describe('an edit (G2) @SC-1387', () => {
  it('replaces a passage found exactly once, keeping the page before as a version', async () => {
    const first = await create()
    const result = done(await editPage(project, { page: RELEASE, old_string: 'on Thursdays', new_string: 'on Fridays' }))
    expect(result.change).toBe('edited')
    expect(await onDisk(RELEASE)).toContain('on Fridays')
    expect((await listVersions(project, RELEASE)).versions[0].version).toBe(first.version)
  })

  it('refuses a passage found twice, saying how many times, unless replace_all', async () => {
    await create(RELEASE, page('Release', 'deploy, then deploy again\n'))
    const twice = refused(await editPage(project, { page: RELEASE, old_string: 'deploy', new_string: 'ship' }))
    expect(twice).toMatchObject({ reason: 'not_unique', found: 2 })
    expect(twice.message).toContain('2 times')
    done(await editPage(project, { page: RELEASE, old_string: 'deploy', new_string: 'ship', replace_all: true }))
    expect(await onDisk(RELEASE)).toContain('ship, then ship again')
  })

  it('refuses a passage not found, a change that changes nothing, and a missing page', async () => {
    await create()
    expect(refused(await editPage(project, { page: RELEASE, old_string: 'nowhere', new_string: 'x' }))).toMatchObject({ reason: 'not_unique', found: 0 })
    expect(refused(await editPage(project, { page: RELEASE, old_string: 'main', new_string: 'main' })).reason).toBe('no_change')
    expect(refused(await editPage(project, { page: 'nope.md', old_string: 'a', new_string: 'b' })).reason).toBe('not_found')
  })

  it('refuses an edit that breaks the rules, leaving the page as it was', async () => {
    await create()
    const result = refused(await editPage(project, { page: RELEASE, old_string: 'title: Release process\n', new_string: '' }))
    expect(result.problems?.map(p => p.code)).toContain('title_missing')
    expect(await onDisk(RELEASE)).toBe(page('Release process'))
    expect((await listVersions(project, RELEASE)).versions).toEqual([])
  })
})

describe('delete, restore and permanent deletion @SC-1388', () => {
  it('moves a deleted page into its versions, listed as Recently deleted, and restores it as a new version', async () => {
    await create()
    const deleted = done(await deletePage(project, { page: RELEASE }))
    expect(deleted.change).toBe('deleted')
    expect('version' in deleted).toBe(false)
    await expect(fs.access(path.join(pagesDir(), RELEASE))).rejects.toThrow()
    await expect(fs.access(path.join(pagesDir(), 'processes'))).rejects.toThrow()

    const recently = (await listDeleted(project)).versions
    expect(recently).toHaveLength(1)
    expect(recently[0]).toMatchObject({ page: RELEASE, id: deleted.previousVersionId, deleted: true, change: 'deleted' })
    expect(Date.parse(recently[0].removeAfter!) - Date.parse(recently[0].savedAt)).toBe(30 * 24 * 60 * 60 * 1000)

    const restored = done(await restorePage(project, { page: RELEASE, versionId: deleted.previousVersionId! }))
    expect(restored.change).toBe('restored')
    expect(await onDisk(RELEASE)).toBe(page('Release process'))
    expect((await listDeleted(project)).versions).toEqual([])
  })

  it('restores an earlier version over the current page, keeping the current one first', async () => {
    const first = await create()
    const second = done(await writePage(project, { page: RELEASE, content: page('Second'), baseVersion: first.version! }))
    const restored = done(await restorePage(project, { page: RELEASE, versionId: second.previousVersionId! }))
    expect(await onDisk(RELEASE)).toBe(page('Release process'))
    const { versions } = await listVersions(project, RELEASE)
    expect(versions.map(v => v.change)).toEqual(['restored', 'edited'])
    expect(versions[0]).toMatchObject({ id: restored.previousVersionId, version: second.version })
  })

  it('answers the second half of a move as moved, marked so in its versions', async () => {
    await create()
    expect(done(await deletePage(project, { page: RELEASE, movedTo: 'how/release.md' })).change).toBe('moved')
    expect((await listDeleted(project)).versions[0].change).toBe('moved')
  })

  it('deletes a page permanently, leaving nothing of it on the disk', async () => {
    const first = await create()
    done(await writePage(project, { page: RELEASE, content: page('Second'), baseVersion: first.version! }))
    done(await deletePermanently(project, { page: RELEASE }))
    expect(await filesUnder(knowledgePagesDir(project))).toEqual([])
    expect(await filesUnder(knowledgeVersionsDir(project))).toEqual([])
  })

  it('deletes a deleted page permanently, out of Recently deleted', async () => {
    await create()
    done(await deletePage(project, { page: RELEASE }))
    done(await deletePermanently(project, { page: RELEASE }))
    expect(await filesUnder(knowledgeVersionsDir(project))).toEqual([])
    expect((await listDeleted(project)).versions).toEqual([])
  })

  it('deletes one version permanently, leaving the page and its other versions', async () => {
    const first = await create()
    const second = done(await writePage(project, { page: RELEASE, content: page('Second'), baseVersion: first.version! }))
    const third = done(await writePage(project, { page: RELEASE, content: page('Third'), baseVersion: second.version! }))
    done(await deletePermanently(project, { page: RELEASE, versionId: second.previousVersionId! }))
    const left = (await listVersions(project, RELEASE)).versions.map(v => v.id)
    expect(left).toEqual([third.previousVersionId])
    const kept = await filesUnder(path.join(knowledgeVersionsDir(project), RELEASE))
    expect(kept.some(f => f.startsWith(second.previousVersionId!))).toBe(false)
    expect(await onDisk(RELEASE)).toBe(page('Third'))
  })

  it('answers not found for a page or a version that is not there', async () => {
    expect(refused(await deletePage(project, { page: RELEASE })).reason).toBe('not_found')
    expect(refused(await deletePermanently(project, { page: RELEASE })).reason).toBe('not_found')
    expect(refused(await restorePage(project, { page: RELEASE, versionId: '20261025T120000000Z-0123abcd' })).reason).toBe('not_found')
  })
})

describe('one change at a time per page @SC-1385', () => {
  it('lets the first of two concurrent writes from one version land, and refuses the second as a conflict', async () => {
    const first = await create()
    const [a, b] = await Promise.all([
      writePage(project, { page: RELEASE, content: page('From A'), baseVersion: first.version! }),
      writePage(project, { page: RELEASE, content: page('From B'), baseVersion: first.version! }),
    ])
    expect(a.outcome).toBe('done')
    expect(refused(b)).toMatchObject({ reason: 'conflict', current: { content: page('From A') } })
    expect(await onDisk(RELEASE)).toBe(page('From A'))
    expect((await listVersions(project, RELEASE)).versions).toHaveLength(1)
  })

  it('applies concurrent edits one after the other, never interleaved', async () => {
    await create(RELEASE, page('Counts', 'one\n'))
    const results = await Promise.all(['two', 'three', 'four'].map(w =>
      editPage(project, { page: RELEASE, old_string: 'one\n', new_string: `one\n${w}\n` })))
    expect(results.every(r => r.outcome === 'done')).toBe(true)
    const body = (await onDisk(RELEASE)).split('---\n\n')[1]
    expect(body.split('\n').filter(Boolean).sort()).toEqual(['four', 'one', 'three', 'two'])
    const ids = (await listVersions(project, RELEASE)).versions.map(v => v.id)
    expect(new Set(ids).size).toBe(3)
    expect([...ids].sort().reverse()).toEqual(ids)
  })
})

describe("the organisation's knowledge @SC-1390", () => {
  it('goes through the same gate, in its own root', async () => {
    done(await writePage(org, { page: 'brand.md', content: page('Brand'), baseVersion: null }))
    expect(await fs.readFile(path.join(site.root(), 'knowledge', 'org', 'org', 'pages', 'brand.md'), 'utf8')).toBe(page('Brand'))
  })
})
