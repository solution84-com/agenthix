/**
 * The itemiser (`location.listKnowledge`): sections and pages with their index entries and problems, hand-placed
 * files with broken front matter listed under them, broken links, and links and hidden names never listed or followed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { KNOWLEDGE_LIMITS, KNOWLEDGE_LIST_MAX_FILES, LOCATION_FILE_METHODS, LocationFileError } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import { listKnowledge } from '../../storage/ownerFolderMethods'
import { channelMethods } from '../../hq/channelMethods'
import { knowledgePagesDir } from '../../storage/paths'

const owner = { ownerType: 'project' as const, ownerId: 'proj-0001' }
let root: string
let outside: string
let pages: string
const savedSiteRoot = process.env.SITE_ROOT

const good = (title: string, extra = '', body = 'Body.\n') =>
  `---\ntitle: ${title}\ndescription: About ${title}\ntags: [releases, deploys]\n${extra}---\n${body}`

async function put(rel: string, body: string, when = '2026-01-01T00:00:00.000Z'): Promise<void> {
  const file = path.join(pages, rel)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, body)
  await fs.utimes(file, new Date(when), new Date(when))
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'site-outside-'))
  process.env.SITE_ROOT = root
  pages = knowledgePagesDir(owner)
  await fs.mkdir(pages, { recursive: true })
  await fs.writeFile(path.join(outside, 'secret.md'), 'not yours\n')
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

describe('location.listKnowledge: the itemiser @SC-1391', () => {
  it('lists sections and pages with title, description, tags, properties, size, time and version', async () => {
    const text = good('Release', 'owner: platform-team\n')
    await put('processes/release.md', text, '2026-01-02T00:00:00.000Z')
    await put('overview.md', good('Overview'))
    const result = await listKnowledge(owner)
    expect(result.truncated).toBe(false)
    expect(result.sections).toEqual([{ path: 'processes', pageCount: 1 }])
    const release = result.pages.find(p => p.page === 'processes/release.md')!
    expect(release).toEqual({
      page: 'processes/release.md',
      title: 'Release',
      description: 'About Release',
      tags: ['releases', 'deploys'],
      properties: { owner: 'platform-team' },
      size: Buffer.byteLength(text),
      modifiedAt: '2026-01-02T00:00:00.000Z',
      version: createHash('sha256').update(text).digest('hex'),
      problems: [],
    })
    expect(result.pages.map(p => p.page)).toEqual(['overview.md', 'processes/release.md'])
  })

  it('lists a hand-placed file with broken front matter under its problems, titled from its file name', async () => {
    await put('notes/scratch.md', '---\ntitle: [unclosed\n\nno end of the front matter\n')
    await put('plain.md', 'No front matter at all.\n')
    const result = await listKnowledge(owner)
    const scratch = result.pages.find(p => p.page === 'notes/scratch.md')!
    expect(scratch.title).toBe('scratch')
    expect(scratch.problems.length).toBeGreaterThan(0)
    expect(scratch.problems.every(p => p.message.length > 0)).toBe(true)
    const plain = result.pages.find(p => p.page === 'plain.md')!
    expect(plain.title).toBe('plain')
    expect(plain.problems.map(p => p.code)).toContain('front_matter_missing')
  })

  it('lists a link to a missing page as a problem, and a link to a present one as none', async () => {
    await put('a.md', good('A', '', 'See [B](b.md) and [gone](gone.md) and [away](../../outside.md).\n'))
    await put('b.md', good('B'))
    const a = (await listKnowledge(owner)).pages!.find(p => p.page === 'a.md')!
    expect(a.problems.map(p => p.code).sort()).toEqual(['link_broken', 'link_outside'])
  })

  it('does not judge a link to another level, which this site cannot see', async () => {
    await put('a.md', good('A', '', 'See [org](org:how-we-work/review.md).\n'))
    expect((await listKnowledge(owner)).pages![0].problems).toEqual([])
  })

  it('lists a page over 64 KB with the size problem, and a file with a bad name with its name problem', async () => {
    await put('big.md', good('Big', '', 'x'.repeat(KNOWLEDGE_LIMITS.maxPageBytes)))
    await put('Not A Page.md', good('Odd'))
    const result = await listKnowledge(owner)
    expect(result.pages.find(p => p.page === 'big.md')!.problems.map(p => p.code)).toContain('too_large')
    expect(result.pages.find(p => p.page === 'Not A Page.md')!.problems.map(p => p.code)).toContain('name_invalid')
  })

  it('skips hidden entries and never follows or lists a link', async () => {
    await put('kept.md', good('Kept'))
    await put('.git/config', 'x')
    await put('.hidden.md', good('Hidden'))
    await fs.symlink(path.join(outside, 'secret.md'), path.join(pages, 'escape.md'))
    await fs.symlink(outside, path.join(pages, 'linked-dir'))
    const result = await listKnowledge(owner)
    expect(result.pages.map(p => p.page)).toEqual(['kept.md'])
    expect(result.sections).toEqual([])
  })

  it('stops at the section depth bound', async () => {
    const dirs = (n: number) => Array.from({ length: n }, (_, i) => `d${i}`)
    await put([...dirs(KNOWLEDGE_LIMITS.maxSectionDepth), 'deepest.md'].join('/'), good('Deepest'))
    await put([...dirs(KNOWLEDGE_LIMITS.maxSectionDepth + 1), 'too-deep.md'].join('/'), good('Too deep'))
    const names = (await listKnowledge(owner)).pages!.map(p => p.page)
    expect(names).toHaveLength(1)
    expect(names[0]).toMatch(/deepest\.md$/)
  })

  it('stops at the page bound and says so', async () => {
    await Promise.all(Array.from({ length: KNOWLEDGE_LIST_MAX_FILES + 3 }, (_, i) => put(`p${i}.md`, 'x')))
    const result = await listKnowledge(owner)
    expect(result.truncated).toBe(true)
    expect(result.pages).toHaveLength(KNOWLEDGE_LIST_MAX_FILES)
  })

  it('answers empty when there are no pages yet', async () => {
    await fs.rm(path.dirname(pages), { recursive: true, force: true })
    expect(await listKnowledge(owner)).toEqual({ truncated: false, sections: [], pages: [] })
  })

  it('refuses a pages folder that is a link, naming no path on the disk', async () => {
    await fs.rm(pages, { recursive: true })
    await fs.mkdir(path.join(outside, 'real'))
    await fs.writeFile(path.join(outside, 'real', 'x.md'), good('X'))
    await fs.symlink(path.join(outside, 'real'), pages)
    const err = await listKnowledge(owner).then(() => null, (e: unknown) => e as LocationFileError)
    expect(err?.code).toBe('outside')
    expect(err?.message).not.toContain(root)
  })

  it('refuses an owner id that cannot be a folder name, without echoing it', async () => {
    const err = await listKnowledge({ ...owner, ownerId: '../etc' }).then(() => null, (e: unknown) => e as LocationFileError)
    expect(err?.code).toBe('outside')
    expect(err?.message).not.toContain('etc')
  })

  it('is registered on the control channel under its name', () => {
    expect(channelMethods[LOCATION_FILE_METHODS.listKnowledge]).toBeTypeOf('function')
  })
})
