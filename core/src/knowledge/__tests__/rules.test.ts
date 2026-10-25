import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_LIMITS as L } from '../limits.js'
import { checkPageChange, checkPageForListing, checkPageProperties, checkPageTags, checkPageTitle, utf8Bytes } from '../rules.js'
import { checkPageName, parseQualifiedPageName, qualifiedPageName, titleFromPageName } from '../pageNames.js'
import { pageLinks } from '../links.js'

const RELEASE = [
  '---',
  'title: Release process',
  'description: How we cut and publish a release, and who approves a staging deploy.',
  'tags: [releases, deploys]',
  '---',
  '',
  '## Cutting a release',
  'Releases are cut from main on Thursdays. See [reviews](../how-we-work/code-review.md)',
  'and [the org policy](org:policies/security.md).',
].join('\n')

const fm = (...lines: string[]) => `---\n${lines.join('\n')}\n---\nbody\n`
const messages = (name: string, content: string) => checkPageChange(name, content).problems.map(p => p.message)

describe('T1: page names @SC-1378', () => {
  it.each(['release.md', 'processes/release.md', 'a/b/c/d/e/f/g/h/page.md', 'decisions/0002-monorepo.md', 'x_y.v2.md'])('takes %s', name => {
    expect(checkPageName(name)).toEqual([])
  })

  it.each([
    ['', /no name/],
    ['release.txt', /ends in \.md/],
    ['/etc/passwd.md', /inside the level/],
    ['a\\b.md', /forward slashes/],
    ['../x.md', /starts with a dot/],
    ['a/../b.md', /starts with a dot/],
    ['.hidden.md', /starts with a dot/],
    ['a/.git/x.md', /starts with a dot/],
    ['a//b.md', /empty part/],
    ['a b.md', /only letters/],
    ['é.md', /only letters/],
    ['a/b/c/d/e/f/g/h/i/page.md', /at most 8 sections/],
    [`${'a'.repeat(256)}.md`, /over 255/],
    ['a\u0000.md', /only letters/],
  ])('refuses %j', (name, why) => {
    const problems = checkPageName(name)
    expect(problems).toHaveLength(1)
    expect(problems[0].code).toBe('name_invalid')
    expect(problems[0].message).toMatch(why)
  })

  it('titles a page from its file name', () => {
    expect(titleFromPageName('processes/release-process.md')).toBe('release-process')
  })
})

describe('level names @SC-1378', () => {
  it('reads and writes a page name behind its level', () => {
    expect(parseQualifiedPageName('website-rebuild:processes/release.md')).toEqual({ level: 'website-rebuild', page: 'processes/release.md' })
    expect(qualifiedPageName('org', 'how-we-work/code-review.md')).toBe('org:how-we-work/code-review.md')
  })

  it.each(['processes/release.md', ':x.md', 'Org:x.md', 'C:\\x.md', `${'a'.repeat(65)}:x.md`])('finds no level in %j', name => {
    expect(parseQualifiedPageName(name)).toBeNull()
  })
})

describe('T2, T3, T4: a change @SC-1380', () => {
  it("passes the spec's example page", () => {
    const check = checkPageChange('processes/release.md', RELEASE)
    expect(check.problems).toEqual([])
    expect(check.summary).toEqual({
      title: 'Release process',
      description: 'How we cut and publish a release, and who approves a staging deploy.',
      tags: ['releases', 'deploys'],
      properties: {},
    })
  })

  it('keeps properties as written, in order', () => {
    const check = checkPageChange('decisions/0002.md', fm('title: T', 'description: D.', 'status: accepted', 'date: 2026-10-20', 'owners: [mia, sam]'))
    expect(check.problems).toEqual([])
    expect(check.summary.properties).toEqual({ status: 'accepted', date: '2026-10-20', owners: ['mia', 'sam'] })
    expect(Object.keys(check.summary.properties)).toEqual(['status', 'date', 'owners'])
  })

  it('says the description is missing, in the words the spec gives', () => {
    expect(messages('a.md', fm('title: T'))).toEqual(['description is missing'])
  })

  it('says a tag must be lower-case, in the words the spec gives', () => {
    expect(messages('a.md', fm('title: T', 'description: D.', 'tags: [Deploys]'))).toEqual(["tag 'Deploys' must be lower-case"])
  })

  it('refuses a page over 64 KB', () => {
    const big = fm('title: T', 'description: D.') + 'x'.repeat(L.maxPageBytes)
    const [p] = checkPageChange('a.md', big).problems
    expect(p.code).toBe('too_large')
    expect(p.message).toMatch(/over 64 KB/)
  })

  it('counts bytes, not characters', () => {
    expect(utf8Bytes('aé€😀')).toBe(1 + 2 + 3 + 4)
  })

  it.each([
    [fm('description: D.'), 'title_missing'],
    [fm('title:', 'description: D.'), 'title_missing'],
    [fm('title: [a, b]', 'description: D.'), 'title_missing'],
    [fm(`title: ${'t'.repeat(L.maxTitleChars + 1)}`, 'description: D.'), 'title_too_long'],
    [fm('title: T', `description: ${'d'.repeat(L.maxDescriptionChars + 1)}`), 'description_too_long'],
    [fm('title: T', 'description: D.', 'tags: releases'), 'tags_invalid'],
    [fm('title: T', 'description: D.', `tags: [${Array.from({ length: L.maxTags + 1 }, (_, i) => `t${i}`).join(', ')}]`), 'tags_too_many'],
    [fm('title: T', 'description: D.', 'tags: [a_b]'), 'tag_invalid'],
    [fm('title: T', 'description: D.', 'tags: [a, a]'), 'tag_invalid'],
    [fm('title: T', 'description: D.', ...Array.from({ length: L.maxProperties + 1 }, (_, i) => `p${i}: v`)), 'properties_too_many'],
    ['no front matter', 'front_matter_missing'],
    [fm('title: T', 'description: D.', 'sidebar:', '  order: 1'), 'front_matter_invalid'],
  ])('refuses %j with %s', (content, code) => {
    expect(checkPageChange('a.md', content).problems.map(p => p.code)).toEqual([code])
  })

  it('counts a title in characters a person sees', () => {
    expect(checkPageTitle('😀'.repeat(L.maxTitleChars))).toEqual([])
  })

  it('refuses a new page in a full place, and not an edit to one', () => {
    expect(checkPageChange('a.md', RELEASE, { creating: true, pagesInPlace: L.maxPages }).problems.map(p => p.code)).toEqual(['too_many_pages'])
    expect(checkPageChange('a.md', RELEASE, { creating: false, pagesInPlace: L.maxPages }).problems).toEqual([])
  })

  it('does not check links on a change', () => {
    expect(checkPageChange('a.md', `${RELEASE}\n[gone](nowhere.md)`).problems).toEqual([])
  })

  it('gives every problem a field for the editor', () => {
    for (const p of checkPageChange('A b.md', fm('title:', 'tags: [X]')).problems) expect(p.field).toBeTruthy()
  })
})

describe("hq's editor, field by field @SC-1380", () => {
  it('checks tags and properties as typed', () => {
    expect(checkPageTags(['ok', 'Bad', 'no way', ''])).toHaveLength(3)
    expect(checkPageProperties({ status: 'ok', title: 'x', 'bad name': 'v', note: 'two\nlines' }).map(p => p.property))
      .toEqual(['title', 'bad name', 'note'])
  })
})

describe('T5: links, at listing @SC-1381', () => {
  const exists = new Set(['how-we-work/code-review.md', 'processes/release.md'])
  const context = { pageExists: (level: string | null, page: string) => (level === null ? exists.has(page) : undefined) }

  it('finds page links, resolved from the page, and leaves others alone', () => {
    const links = pageLinks('processes/release.md', [
      '[a](../how-we-work/code-review.md) [b](org:policies/security.md#top) [c](https://x.com/a.md)',
      '[d](mailto:x@y.md) [e](#anchor) ![pic](img.md) [f](notes.txt) `[g](code.md)`',
      '```',
      '[h](fenced.md)',
      '```',
      '[ref]: ./sub/page.md',
    ].join('\n'))
    expect(links.map(l => [l.level, l.page, l.line])).toEqual([
      [null, 'how-we-work/code-review.md', 1],
      ['org', 'policies/security.md', 1],
      [null, 'processes/sub/page.md', 6],
    ])
  })

  it('lists a broken link and a link out of the level as problems, and does not refuse', () => {
    const content = `${RELEASE}\n[gone](gone.md) [up](../../x.md)`
    const check = checkPageForListing('processes/release.md', content, context)
    expect(check.problems.map(p => p.code)).toEqual(['link_broken', 'link_outside'])
    expect(check.problems[0].message).toBe("the link to 'gone.md' leads to no page")
    expect(check.problems[0].line).toBe(10)
  })

  it('does not call a link to another level broken when it cannot know', () => {
    expect(checkPageForListing('processes/release.md', RELEASE, context).problems).toEqual([])
  })

  it('lists a page with problems, titled from its file name', () => {
    const check = checkPageForListing('processes/old-notes.md', '# Notes\n', context)
    expect(check.summary.title).toBe('old-notes')
    expect(check.problems.map(p => p.code)).toEqual(['front_matter_missing'])
  })

  it('stays fast on a hostile body', () => {
    const started = Date.now()
    pageLinks('a.md', `${'['.repeat(60_000)}\n[a](${' '.repeat(60_000)}\n${'`a'.repeat(30_000)}`)
    expect(Date.now() - started).toBeLessThan(500)
  })
})
