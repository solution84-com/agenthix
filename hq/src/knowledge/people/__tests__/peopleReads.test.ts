/**
 * What a person reads of knowledge (agent knowledge spec, part 5, U2–U5): access before the site, the itemiser's
 * listing with who changed each page, a page with *Linked from*, a page's history with who wrote each version,
 * Recently deleted with who deleted, and search with its scope, each hit marked with its level.
 */
import { describe, expect, it } from 'vitest'
import { versionOf } from '@agenthix/core/file-tools'
import { deletePage, movePage, savePage } from '../changes'
import { linkedFrom, literalPattern } from '../linkedFrom'
import { listPages, pageVersions, readPage, recentlyDeleted } from '../reads'
import { searchPages } from '../search'
import { ORG, PAGE, WEB, fakePeople } from './fakePeople'

const v = (t: string) => versionOf(Buffer.from(t, 'utf8'))
const web = { ownerType: 'project' as const, ownerId: WEB.ownerId }
const org = { ownerType: 'org' as const }
const LINKING = '---\ntitle: Deploys\n---\nSee [the release process](../processes/release.md) and [review](org:how-we-work/review.md).\n'

function setup() {
  const f = fakePeople()
  f.sites.put(WEB, 'processes/release.md', PAGE)
  f.sites.put(WEB, 'how-we-work/deploys.md', LINKING)
  f.sites.put(WEB, 'notes.md', '---\ntitle: Notes\n---\nrelease.md is only named here, not linked.\n')
  f.sites.put(ORG, 'how-we-work/review.md', '---\ntitle: Review\n---\nRelease reviews need two approvals.\n')
  f.allow(web, 'sam', 'changes')
  f.allow(web, 'vic', 'reads')
  f.allow(org, 'sam', 'reads')
  f.allow(org, 'vic', 'reads')
  return f
}

describe('access @SC-1417', () => {
  it('a member reads, with whether they may change; a non-member is refused before any site is asked', async () => {
    const f = setup()
    expect((await listPages(f.deps, web, 'sam')).canChange).toBe(true)
    expect((await listPages(f.deps, web, 'vic')).canChange).toBe(false)
    expect((await listPages(f.deps, org, 'vic')).canChange).toBe(false)
    const before = f.sites.calls.length
    for (const call of [
      () => listPages(f.deps, web, 'eve'),
      () => readPage(f.deps, web, { page: 'processes/release.md' }, 'eve'),
      () => pageVersions(f.deps, web, { page: 'processes/release.md' }, 'eve'),
      () => recentlyDeleted(f.deps, web, 'eve'),
      () => searchPages(f.deps, web, { pattern: 'release' }, 'eve'),
    ]) await expect(call()).rejects.toMatchObject({ status: 403 })
    expect(f.sites.calls.length).toBe(before)
  })
})

describe('the listing @SC-1418', () => {
  it('lists sections and pages as the itemiser gives them, with who changed each page last', async () => {
    const f = setup()
    const edited = PAGE.replace('checks pass', 'checks pass, with Mia')
    await savePage(f.deps, web, { page: 'processes/release.md', content: edited, baseVersion: v(PAGE) }, 'sam')
    const list = await listPages(f.deps, web, 'vic')
    expect(list.sections.map(s => s.path).sort()).toEqual(['how-we-work', 'processes'])
    expect(list.pages.find(p => p.page === 'processes/release.md')).toMatchObject({ lastChange: { by: { kind: 'person', name: 'sam' }, change: 'edited' } })
    // A page put on the disk outside the gate has no record, and says nothing of who.
    expect(list.pages.find(p => p.page === 'notes.md')?.lastChange).toBeUndefined()
  })
})

describe('a page @SC-1418', () => {
  it('reads its text and version, who changed it, and the pages of the place that link to it', async () => {
    const f = setup()
    const page = await readPage(f.deps, web, { page: 'processes/release.md' }, 'vic')
    expect(page).toMatchObject({ page: 'processes/release.md', content: PAGE, version: v(PAGE), linkedFrom: ['how-we-work/deploys.md'], canChange: false })
  })

  it('reads one kept version by its id', async () => {
    const f = setup()
    const edited = PAGE.replace('checks pass', 'checks pass, with Mia')
    await savePage(f.deps, web, { page: 'processes/release.md', content: edited, baseVersion: v(PAGE) }, 'sam')
    f.sites.kept.set('20261025T100000000Z-0000abcd', f.sites.kept.get('k1')!)
    expect(await readPage(f.deps, web, { page: 'processes/release.md', versionId: '20261025T100000000Z-0000abcd' }, 'sam'))
      .toMatchObject({ content: PAGE, version: v(PAGE), linkedFrom: [] })
  })

  it('a missing page is a 404 in words; a name leaving the place is refused before the site is asked', async () => {
    const f = setup()
    await expect(readPage(f.deps, web, { page: 'gone.md' }, 'sam')).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/moved or deleted/) })
    const before = f.sites.calls.length
    await expect(readPage(f.deps, web, { page: '../files/AGENTS.md' }, 'sam')).rejects.toMatchObject({ status: 400 })
    await expect(readPage(f.deps, web, { page: 'a.md', versionId: '../../x' }, 'sam')).rejects.toMatchObject({ status: 400 })
    expect(f.sites.calls.length).toBe(before)
  })

  it('Linked from searches for the file name as fixed text, never as a pattern', () => {
    expect(literalPattern('a.(b)+[c]-d.md')).toBe('a\\.\\(b\\)\\+\\[c\\]\\-d\\.md')
  })

  it('Linked from is empty, not a failure, when the site cannot search', async () => {
    const f = setup()
    f.sites.grep = async () => ({ ok: false, why: 'unreachable' })
    expect(await linkedFrom(f.deps, WEB, 'website-rebuild', 'processes/release.md')).toEqual([])
  })
})

describe('history and recently deleted', () => {
  it("lists a page's kept versions, newest first, each with who wrote it @SC-1419 @SC-1425", async () => {
    const f = setup()
    const edited = PAGE.replace('checks pass', 'checks pass, with Mia')
    await savePage(f.deps, web, { page: 'processes/release.md', content: edited, baseVersion: v(PAGE) }, 'sam')
    const { versions } = await pageVersions(f.deps, web, { page: 'processes/release.md' }, 'vic')
    // The page as it was before Sam's edit: on the disk before any record, so nobody is named.
    expect(versions).toEqual([expect.objectContaining({ id: 'k1', version: v(PAGE), change: 'edited' })])
    expect(versions[0]!.by).toBeUndefined()
    await savePage(f.deps, web, { page: 'processes/release.md', content: PAGE, baseVersion: v(edited) }, 'sam')
    const again = await pageVersions(f.deps, web, { page: 'processes/release.md' }, 'vic')
    expect(again.versions.find(x => x.version === v(edited))?.by).toEqual({ kind: 'person', name: 'sam' })
  })

  it('lists deleted pages with who deleted them and when they go, and not a page moved away @SC-1423', async () => {
    const f = setup()
    await deletePage(f.deps, web, { page: 'processes/release.md' }, 'sam')
    await movePage(f.deps, web, { from: 'notes.md', to: 'archive/notes.md', baseVersion: v('---\ntitle: Notes\n---\nrelease.md is only named here, not linked.\n') }, 'sam')
    const { pages } = await recentlyDeleted(f.deps, web, 'vic')
    expect(pages).toEqual([{
      page: 'processes/release.md', deletedAt: expect.any(String), by: { kind: 'person', name: 'sam' },
      removeAfter: '2026-11-24T10:00:00.000Z', versionId: 'k-del',
    }])
  })
})

describe('search @SC-1426', () => {
  it('searches this place and the organisation by default, each hit marked with its level', async () => {
    const f = setup()
    const answer = await searchPages(f.deps, web, { pattern: 'release' }, 'sam')
    expect(answer.levels).toEqual([{ level: 'website-rebuild', name: 'Website rebuild' }, { level: 'org', name: 'Organisation' }])
    expect(new Set(answer.hits.map(h => h.level))).toEqual(new Set(['website-rebuild', 'org']))
    expect(answer.hits.find(h => h.level === 'org')).toEqual({
      level: 'org', page: 'how-we-work/review.md', title: 'Review', matches: [{ line: 4, text: 'Release reviews need two approvals.' }],
    })
    expect(answer.unanswered).toEqual([])
  })

  it('answers one result per page: its title and description, and the first two matching lines of its text', async () => {
    const f = setup()
    f.sites.put(WEB, 'processes/review.md', '---\ntitle: Code review\ndescription: How a review goes.\ntags: [review, process]\n---\nA review needs two people.\nReview notes go in the pull request.\nThe last review rule: review twice.\n')
    const answer = await searchPages(f.deps, web, { pattern: 'review', scope: 'this' }, 'sam')
    const mine = answer.hits.filter(h => h.page === 'processes/review.md')
    expect(mine).toEqual([{
      level: 'website-rebuild', page: 'processes/review.md', title: 'Code review', description: 'How a review goes.',
      matches: [{ line: 6, text: 'A review needs two people.' }, { line: 7, text: 'Review notes go in the pull request.' }],
    }])
  })

  it('a match only in the title, description or tags is a page with no excerpt, never a front matter line', async () => {
    const f = setup()
    const answer = await searchPages(f.deps, web, { pattern: 'How we release', scope: 'this' }, 'sam')
    expect(answer.hits).toEqual([{ level: 'website-rebuild', page: 'processes/release.md', title: 'Release process', description: 'How we release.', matches: [] }])
    const tagged = await searchPages(f.deps, web, { pattern: 'tags', scope: 'this' }, 'sam')
    expect(tagged.hits.every(h => h.matches.every(m => !/^(title|tags|description):/.test(m.text)))).toBe(true)
  })

  it('a page that cannot be read for its title is still a result, titled from its name', async () => {
    const f = setup()
    const read = f.sites.read.bind(f.sites)
    f.sites.read = async (owner, page, id) => (page === 'notes.md' ? { ok: false, why: 'failed' } : read(owner, page, id))
    const answer = await searchPages(f.deps, web, { pattern: 'only named', scope: 'this' }, 'sam')
    expect(answer.hits).toHaveLength(1)
    expect(answer.hits[0]).toMatchObject({ page: 'notes.md', title: 'notes' })
  })

  it('This project and Organisation each search one level; organisation knowledge searches only itself', async () => {
    const f = setup()
    expect((await searchPages(f.deps, web, { pattern: 'release', scope: 'this' }, 'sam')).levels.map(l => l.level)).toEqual(['website-rebuild'])
    expect((await searchPages(f.deps, web, { pattern: 'release', scope: 'org' }, 'sam')).levels.map(l => l.level)).toEqual(['org'])
    expect((await searchPages(f.deps, org, { pattern: 'release', scope: 'both' }, 'sam')).levels.map(l => l.level)).toEqual(['org'])
  })

  it('what a person types is found as it is written, never run as a pattern', async () => {
    const f = setup()
    await searchPages(f.deps, web, { pattern: '(a+)+$ -e --pre=sh', scope: 'this' }, 'sam')
    const asked = f.sites.calls.filter(c => c.method === 'grep').at(-1)?.params as { pattern: string }
    expect(asked.pattern).toBe('\\(a\\+\\)\\+\\$ \\-e \\-\\-pre=sh')
  })

  it('a level whose site does not answer is named as unanswered, while the others answer', async () => {
    const f = setup()
    f.sites.modes.set('org:org', 'silent')
    const answer = await searchPages(f.deps, web, { pattern: 'release' }, 'sam')
    expect(answer.unanswered).toEqual(['org'])
    expect(answer.hits.every(h => h.level === 'website-rebuild')).toBe(true)
  })

  it('an empty search asks no site; an over-long one is refused', async () => {
    const f = setup()
    const before = f.sites.calls.length
    expect((await searchPages(f.deps, web, { pattern: '   ' }, 'sam')).hits).toEqual([])
    expect(f.sites.calls.length).toBe(before)
    await expect(searchPages(f.deps, web, { pattern: 'x'.repeat(201) }, 'sam')).rejects.toMatchObject({ status: 400 })
  })
})
