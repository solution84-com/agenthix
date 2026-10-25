/**
 * `location.searchKnowledge`: terms, context, merging, the budget and the cut,
 * and that containment holds as it does for the listing and the read.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { LOCATION_FILE_METHODS, LocationFileError } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import { OWNER_SEARCHES_PER_MINUTE, searchKnowledge, searchKnowledgeParams, queryTerms, rankExcerpts } from '../knowledgeSearch'
import { channelMethods } from '../../hq/channelMethods'
import { knowledgePagesDir } from '../paths'

const owner = { ownerType: 'project' as const, ownerId: 'proj-0001' }
let root: string
let outside: string
let knowledge: string
const savedSiteRoot = process.env.SITE_ROOT

async function put(rel: string, body: string): Promise<void> {
  const file = path.join(knowledge, rel)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, body)
}

const ask = (query: string, maxChars = 4000) => searchKnowledge({ ...owner, query, maxChars })

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'site-outside-'))
  process.env.SITE_ROOT = root
  knowledge = knowledgePagesDir(owner)
  await fs.mkdir(knowledge, { recursive: true })
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

describe('queryTerms @SC-1015', () => {
  it('lowercases, splits on anything that is not a letter or digit, drops one-letter words and repeats', () => {
    expect(queryTerms('How do we Deploy, deploy-to prod? a')).toEqual(['how', 'do', 'we', 'deploy', 'to', 'prod'])
  })
})

describe('the search @SC-1015', () => {
  it('finds a line case-insensitively and returns it with two lines of context and its line numbers', async () => {
    await put('deploy.md', ['one', 'two', 'three', 'Deploys go out on THURSDAY', 'five', 'six', 'seven', 'eight'].join('\n'))
    const result = await ask('thursday')
    expect(result.excerpts).toEqual([
      { path: 'deploy.md', startLine: 2, endLine: 6, text: 'two\nthree\nDeploys go out on THURSDAY\nfive\nsix' },
    ])
    expect(result.cut).toEqual([])
    expect(result.truncated).toBe(false)
  })

  it('merges ranges that overlap or touch into one excerpt', async () => {
    await put('a.md', ['x', 'alpha', 'y', 'beta', 'z', 'w', 'v', 'u', 't', 's'].join('\n'))
    const { excerpts } = await ask('alpha beta')
    expect(excerpts).toHaveLength(1)
    expect(excerpts[0]).toMatchObject({ startLine: 1, endLine: 6 })
  })

  it('ranks a line matching more terms first within a file kind, and puts INDEX.md first', async () => {
    await put('notes/a.md', 'billing and invoices both here\n')
    await put('INDEX.md', 'invoices live in notes/a.md\n')
    const { excerpts } = await ask('billing invoices')
    expect(excerpts.map(e => e.path)).toEqual(['INDEX.md', 'notes/a.md'])
  })

  it('searches files at depth and ignores hidden ones', async () => {
    await put('a/b/deep.md', 'the secret handshake\n')
    await put('.hidden.md', 'the secret handshake\n')
    const { excerpts } = await ask('handshake')
    expect(excerpts.map(e => e.path)).toEqual(['a/b/deep.md'])
  })

  it('answers nothing for a query with no usable terms, or no match', async () => {
    await put('a.md', 'hello\n')
    expect((await ask('? !')).excerpts).toEqual([])
    expect((await ask('zebra')).excerpts).toEqual([])
  })

  it('answers nothing, not an error, when the owner has no knowledge folder', async () => {
    await fs.rm(knowledge, { recursive: true })
    expect(await ask('anything')).toEqual({ excerpts: [], cut: [], truncated: false })
  })

  it('holds the answer to maxChars and names the files it left out', async () => {
    await put('a.md', `${'filler '.repeat(5)}\nrelease plan: ${'a'.repeat(100)}\n`)
    await put('b.md', `release notes: ${'b'.repeat(100)}\n`)
    const wide = await ask('release', 10_000)
    expect(wide.excerpts.map(e => e.path)).toEqual(['a.md', 'b.md'])
    const total = (r: typeof wide) => r.excerpts.reduce((n, e) => n + e.text.length, 0)
    const room = wide.excerpts[0].text.length + 10
    const narrow = await ask('release', room)
    expect(total(narrow)).toBeLessThanOrEqual(room)
    expect(narrow.excerpts.map(e => e.path)).toEqual(['a.md'])
    expect(narrow.cut).toEqual(['b.md'])
  })

  it('shortens the last excerpt to whole lines that fit, and names its file as cut', () => {
    const text = Array.from({ length: 5 }, (_, i) => `line ${i} has term and some more words`).join('\n')
    const out = rankExcerpts([{ path: 'a.md', text }], ['term'], 100)
    expect(out.excerpts).toHaveLength(1)
    expect(out.excerpts[0].text.length).toBeLessThanOrEqual(100)
    expect(out.excerpts[0].endLine).toBe(out.excerpts[0].startLine + out.excerpts[0].text.split('\n').length - 1)
    expect(out.cut).toEqual(['a.md'])
  })

  it('with a budget of zero returns no text and names every file with a match', async () => {
    await put('a.md', 'term here\n')
    expect(await ask('term', 0)).toMatchObject({ excerpts: [], cut: ['a.md'] })
  })

  it('leaves out a file larger than it reads', async () => {
    await put('big.md', `term\n${'x'.repeat(600 * 1024)}`)
    await put('small.md', 'term\n')
    expect((await ask('term')).excerpts.map(e => e.path)).toEqual(['small.md'])
  })
})

describe('containment @SC-1015', () => {
  it('never reads through a link inside knowledge/, whether to a file or a folder', async () => {
    await fs.writeFile(path.join(outside, 'secret.md'), 'term in the secret\n')
    await put('real.md', 'term in the open\n')
    await fs.symlink(path.join(outside, 'secret.md'), path.join(knowledge, 'link.md'))
    await fs.symlink(outside, path.join(knowledge, 'linked-dir'))
    const { excerpts } = await ask('term')
    expect(excerpts.map(e => e.path)).toEqual(['real.md'])
  })

  it('refuses when knowledge/ itself is a link', async () => {
    await fs.writeFile(path.join(outside, 'secret.md'), 'term\n')
    await fs.rm(knowledge, { recursive: true })
    await fs.symlink(outside, knowledge)
    await expect(ask('term')).rejects.toBeInstanceOf(LocationFileError)
  })

  it('refuses parameters it does not accept, naming no path', async () => {
    const err = await searchKnowledge({ ...owner, query: 'x', maxChars: 'many' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(LocationFileError)
    expect((err as LocationFileError).code).toBe('invalid')
    expect((err as Error).message).not.toContain(root)
  })
})

describe('the grep form @SC-1393', () => {
  const find = (grep: Record<string, unknown>) =>
    searchKnowledge({ ...owner, query: '', maxChars: 0, grep: grep as never }).then(r => r.grep!)

  it('runs Grep over the owner\'s pages and answers hits by page', async () => {
    await put('processes/release.md', 'Deploys go out on Thursday\nsecond line\n')
    await put('other.md', 'nothing here\n')
    expect(await find({ pattern: 'thursday', '-i': true, output_mode: 'content', '-n': true })).toEqual({
      outcome: 'done', mode: 'content', hits: [{ page: 'processes/release.md', line: 1, text: 'Deploys go out on Thursday' }],
    })
    expect(await find({ pattern: 'line', output_mode: 'count' })).toEqual({
      outcome: 'done', mode: 'count', hits: [{ page: 'processes/release.md', count: 1 }],
    })
    expect(await find({ pattern: 'Deploys' })).toEqual({
      outcome: 'done', mode: 'files_with_matches', hits: [{ page: 'processes/release.md' }],
    })
  })

  it('marks lines around a match as context', async () => {
    await put('a.md', 'one\nneedle\nthree\n')
    const r = await find({ pattern: 'needle', output_mode: 'content', '-C': 1, '-n': true })
    expect(r).toMatchObject({ outcome: 'done', hits: [
      { page: 'a.md', line: 1, text: 'one', context: true },
      { page: 'a.md', line: 2, text: 'needle' },
      { page: 'a.md', line: 3, text: 'three', context: true },
    ] })
  })

  it('continues a long answer from nextOffset', async () => {
    for (let i = 0; i < 3; i++) await put(`p${i}.md`, 'needle\n')
    const first = await find({ pattern: 'needle', head_limit: 2 })
    expect(first).toMatchObject({ outcome: 'done', nextOffset: 2 })
    expect((first as { hits: unknown[] }).hits).toHaveLength(2)
    expect(await find({ pattern: 'needle', head_limit: 2, offset: 2 })).toMatchObject({ outcome: 'done', hits: [expect.anything()] })
  })

  it('refuses a hostile or bad pattern with a fixed message that does not echo it', async () => {
    await put('a.md', 'x\n')
    for (const pattern of ['(?=look)ahead', '(a)\\1', '[unclosed', 'a'.repeat(501)]) {
      const r = await find({ pattern })
      expect(r.outcome).toBe('refused')
      expect((r as { message: string }).message).not.toContain(pattern.slice(0, 20))
      expect((r as { message: string }).message).not.toContain(root)
    }
  })

  it('refuses a flag-shaped pattern, path or glob as plain text, never as an option', async () => {
    await put('a.md', 'x\n')
    expect((await find({ pattern: '--pre=/bin/sh' })).outcome).toBe('done')
    expect((await find({ pattern: 'x', path: '../..' })).outcome).toBe('refused')
    expect((await find({ pattern: 'x', path: '/etc' })).outcome).toBe('refused')
    expect((await find({ pattern: 'x', glob: '--no-ignore' })).outcome).toBe('done')
    expect((await find({ pattern: 'x', '-A': 'many' })).outcome).toBe('refused')
  })

  it('never reads through a link inside the pages', async () => {
    await fs.writeFile(path.join(outside, 'secret.md'), 'term in the secret\n')
    await put('real.md', 'term in the open\n')
    await fs.symlink(path.join(outside, 'secret.md'), path.join(knowledge, 'link.md'))
    await fs.symlink(outside, path.join(knowledge, 'linked-dir'))
    expect(await find({ pattern: 'term' })).toEqual({ outcome: 'done', mode: 'files_with_matches', hits: [{ page: 'real.md' }] })
  })

  it('answers no hits, not an error, for an owner with no pages, and nothing when the folder is a link', async () => {
    await fs.rm(knowledge, { recursive: true })
    expect(await find({ pattern: 'x' })).toEqual({ outcome: 'done', mode: 'files_with_matches', hits: [] })
    await fs.writeFile(path.join(outside, 'secret.md'), 'term\n')
    await fs.symlink(outside, knowledge)
    expect(await find({ pattern: 'term' })).toEqual({ outcome: 'done', mode: 'files_with_matches', hits: [] })
  })

  it('answers the 1.7 shape: empty deprecated fields beside grep', async () => {
    await put('a.md', 'x\n')
    expect(await searchKnowledge({ ...owner, query: 'x', maxChars: 10, grep: { pattern: 'x' } })).toMatchObject({
      excerpts: [], cut: [], truncated: false,
    })
  })

  it('limits calls per owner only as a backstop, well above one caller\'s limit, and says so', async () => {
    const other = { ownerType: 'project' as const, ownerId: 'proj-limit' }
    const otherPages = knowledgePagesDir(other)
    await fs.mkdir(otherPages, { recursive: true })
    await fs.writeFile(path.join(otherPages, 'a.md'), 'x\n')
    const last = await Array.from({ length: OWNER_SEARCHES_PER_MINUTE + 1 }).reduce<Promise<unknown>>(
      p => p.then(() => searchKnowledge({ ...other, query: '', maxChars: 0, grep: { pattern: 'x' } })), Promise.resolve(null),
    )
    expect((last as { grep: { outcome: string } }).grep.outcome).toBe('refused')
  })
})

describe('the organisation\'s knowledge @SC-1393', () => {
  it('is searched by its one id, and another id is refused', async () => {
    const org = { ownerType: 'org' as const, ownerId: 'org' }
    const pages = knowledgePagesDir(org)
    await fs.mkdir(pages, { recursive: true })
    await fs.writeFile(path.join(pages, 'a.md'), 'findme\n')
    const r = await searchKnowledge({ ...org, query: '', maxChars: 0, grep: { pattern: 'findme' } })
    expect(r.grep).toEqual({ outcome: 'done', mode: 'files_with_matches', hits: [{ page: 'a.md' }] })
    expect(searchKnowledgeParams.safeParse({ ...org, ownerId: 'other', query: '', maxChars: 0 }).success).toBe(false)
  })
})

describe('registration @SC-1015 @SC-1393', () => {
  it('is on the control channel', () => {
    expect(channelMethods[LOCATION_FILE_METHODS.searchKnowledge]).toBeTypeOf('function')
  })
})
