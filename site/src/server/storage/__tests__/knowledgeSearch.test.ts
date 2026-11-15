/**
 * `location.searchKnowledge`: Grep over an owner's pages, its refusals, and that
 * containment holds as it does for the listing and the read.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { LOCATION_FILE_METHODS, LocationFileError } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import { OWNER_SEARCHES_PER_MINUTE, searchKnowledge, searchKnowledgeParams } from '../knowledgeSearch'
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

describe('its parameters @SC-1393', () => {
  it('refuses parameters it does not accept, naming no path', async () => {
    for (const bad of [{ ...owner }, { ...owner, grep: { pattern: 5 } }]) {
      const err = await searchKnowledge(bad).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(LocationFileError)
      expect((err as LocationFileError).code).toBe('invalid')
      expect((err as Error).message).not.toContain(root)
    }
  })
})

describe('the grep form @SC-1393', () => {
  const find = (grep: Record<string, unknown>) =>
    searchKnowledge({ ...owner, grep: grep as never }).then(r => r.grep)

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

  it('limits calls per owner only as a backstop, well above one caller\'s limit, and says so', async () => {
    const other = { ownerType: 'project' as const, ownerId: 'proj-limit' }
    const otherPages = knowledgePagesDir(other)
    await fs.mkdir(otherPages, { recursive: true })
    await fs.writeFile(path.join(otherPages, 'a.md'), 'x\n')
    const last = await Array.from({ length: OWNER_SEARCHES_PER_MINUTE + 1 }).reduce<Promise<unknown>>(
      p => p.then(() => searchKnowledge({ ...other, grep: { pattern: 'x' } })), Promise.resolve(null),
    )
    expect((last as { grep: { outcome: string } }).grep.outcome).toBe('refused')
  }, 60_000) // Hundreds of real ripgrep runs, one after another: seconds on a slow runner.
})

describe('the organisation\'s knowledge @SC-1393', () => {
  it('is searched by its one id, and another id is refused', async () => {
    const org = { ownerType: 'org' as const, ownerId: 'org' }
    const pages = knowledgePagesDir(org)
    await fs.mkdir(pages, { recursive: true })
    await fs.writeFile(path.join(pages, 'a.md'), 'findme\n')
    const r = await searchKnowledge({ ...org, grep: { pattern: 'findme' } })
    expect(r.grep).toEqual({ outcome: 'done', mode: 'files_with_matches', hits: [{ page: 'a.md' }] })
    expect(searchKnowledgeParams.safeParse({ ...org, ownerId: 'other', grep: { pattern: 'x' } }).success).toBe(false)
  })
})

describe('registration @SC-1393', () => {
  it('is on the control channel', () => {
    expect(channelMethods[LOCATION_FILE_METHODS.searchKnowledge]).toBeTypeOf('function')
  })
})
