import { describe, expect, it } from 'vitest'
import { parseFrontMatter, renderFrontMatter, type FrontMatterField } from '../frontMatter.js'

const page = (...fm: string[]) => ['---', ...fm, '---', '', '## Body', 'text'].join('\n')
const values = (fields: FrontMatterField[]) => Object.fromEntries(fields.map(f => [f.name, f.value.kind === 'text' ? f.value.text : f.value.items]))

function ok(text: string) {
  const r = parseFrontMatter(text)
  expect(r.problems).toEqual([])
  return values(r.fields)
}

function refused(text: string): string {
  const r = parseFrontMatter(text)
  expect(r.problems).toHaveLength(1)
  expect(r.problems[0].code).toBe('front_matter_invalid')
  return r.problems[0].message
}

describe('reading front matter @SC-1379', () => {
  it("reads the spec's decision page: text, dates and lists kept as written", () => {
    expect(ok(page(
      'title: One repository for web and API',
      'description: Why web and API share a repository.',
      'tags: [decision, architecture]',
      'status: accepted',
      'date: 2026-10-20',
      'supersedes: 0001-two-repos',
    ))).toEqual({
      title: 'One repository for web and API',
      description: 'Why web and API share a repository.',
      tags: ['decision', 'architecture'],
      status: 'accepted',
      date: '2026-10-20',
      supersedes: '0001-two-repos',
    })
  })

  it('reads block lists, quotes, comments and blank lines', () => {
    expect(ok(page(
      '# a comment',
      'title: "Release: the steps"',
      "description: 'It''s how we ship.'",
      '',
      'tags:',
      '  - releases',
      '  - "deploys"',
      'owners:',
      '- mia',
      'count: 3 # a trailing comment',
      'empty:',
    ))).toEqual({
      title: 'Release: the steps', description: "It's how we ship.", tags: ['releases', 'deploys'],
      owners: ['mia'], count: '3', empty: '',
    })
  })

  it('says where the body starts', () => {
    const r = parseFrontMatter(page('title: T', 'description: D.'))
    expect(r.bodyLine).toBe(5)
    expect(r.body).toBe('\n## Body\ntext')
  })

  it('takes Windows line endings and a byte order mark', () => {
    expect(ok('﻿---\r\ntitle: T\r\ndescription: D.\r\n---\r\nbody')).toEqual({ title: 'T', description: 'D.' })
  })

  it('reports a page without front matter as missing it', () => {
    const r = parseFrontMatter('# Just text\n')
    expect(r.present).toBe(false)
    expect(r.problems.map(p => p.code)).toEqual(['front_matter_missing'])
    expect(r.body).toBe('# Just text\n')
  })

  it('refuses an unclosed block', () => {
    expect(refused('---\ntitle: T\n')).toMatch(/no closing '---'/)
  })

  it.each([
    ['nested fields', ['sidebar:', '  order: 1'], /cannot hold other fields/],
    ['a flow map', ['meta: {a: 1}'], /cannot hold other fields/],
    ['a block scalar', ['description: >', '  folded'], /one line/],
    ['a value on two lines', ['description: one', '  two'], /continues 'description'/],
    ['an anchor', ['title: &a T'], /anchors/],
    ['an alias', ['title: *a'], /anchors/],
    ['a tag', ['title: !!str T'], /anchors/],
    ['a plain value holding ": "', ['description: How we release: steps'], /quotes/],
    ['a duplicate field', ['title: A', 'title: B'], /more than once/],
    ['a line that is not a field', ['just words'], /'name: value'/],
    ['a field with no space after the colon', ['title:T'], /'name: value'/],
    ['a bad field name', ['my field: x'], /'name: value'/],
    ['a field name with a symbol', ['$x: y'], /not a field name/],
    ['a list inside a list', ['tags: [a, [b]]'], /not other lists/],
    ['an unclosed list', ['tags: [a, b'], /closing '\]'/],
    ['an empty list item', ['tags: [a, , b]'], /empty/],
    ['an empty block item', ['tags:', '  -'], /empty/],
    ['an unclosed quote', ['title: "T'], /not closed/],
    ['an unknown escape', ['title: "a\\qb"'], /not an escape/],
    ['an escaped line break', ['title: "a\\u000ab"'], /line break/],
    ['a control character', ['title: a\u0007b'], /control character/],
    ['text after a quoted value', ['title: "a" b'], /follows the value/],
    ['a value starting with @', ['title: @me'], /cannot start with '@'/],
    ['a tab-indented line', ['tags:', '\t- a'], /continues|other fields|tabs/],
  ])('refuses %s', (_what, lines, why) => {
    expect(refused(page(...lines))).toMatch(why)
  })

  it('names the line of the problem', () => {
    const r = parseFrontMatter(page('title: T', 'description: D.', 'meta: {a: 1}'))
    expect(r.problems[0].line).toBe(4)
  })

  it('stays linear on hostile input', () => {
    const long = `---\ntitle: ${'a '.repeat(30_000)}\ndescription: ${'['.repeat(30_000)}\n---\n`
    const started = Date.now()
    parseFrontMatter(long)
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe('writing front matter @SC-1379', () => {
  it('writes what it reads back as the same values', () => {
    const fm = {
      title: 'Release: the "steps"',
      description: "It's #1 at shipping.",
      tags: ['releases', 'deploys'],
      properties: { status: 'accepted', date: '2026-10-20', owners: ['mia', 'sam, jr'], note: '- odd start', blank: '' },
    }
    const parsed = ok(`${renderFrontMatter(fm)}body`)
    expect(parsed).toEqual({ title: fm.title, description: fm.description, tags: fm.tags, ...fm.properties })
  })

  it('quotes a title an ordinary YAML reader would take as a number or a yes', () => {
    const text = renderFrontMatter({ title: '2026', description: 'yes' })
    expect(text).toContain('title: "2026"')
    expect(text).toContain('description: "yes"')
  })

  it('leaves plain text plain', () => {
    expect(renderFrontMatter({ title: 'Release process', description: 'How we release.', tags: ['a'] }))
      .toBe('---\ntitle: Release process\ndescription: How we release.\ntags: [a]\n---\n')
  })
})
