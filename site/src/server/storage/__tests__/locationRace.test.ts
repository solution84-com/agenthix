/**
 * The location methods and `location.remove` against a link swapped in AFTER
 * containment has approved a path — the race a location allows, since every
 * agent working there can write it. See `swapAfterCheck.ts` for how the race
 * is staged; `location.remove` walks by its own steps, so its swaps are staged
 * on those instead.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { LocationFileError, type LocationRef } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import { listFiles, statFile, seedFiles, ensureDir } from '../locationFileMethods'
import { removeLocation } from '../locationRemove'
import { locationDir, ownerDir } from '../paths'
import { swapAfterCheck, replaceWithLink } from './swapAfterCheck'

const loc: LocationRef = { ownerType: 'project', ownerId: 'proj-1' }
let root: string
let outside: string
let dir: string
let spy: MockInstance | null = null
const savedSiteRoot = process.env.SITE_ROOT

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'site-outside-'))
  process.env.SITE_ROOT = root
  dir = locationDir(loc)
  await fs.mkdir(path.join(dir, 'docs', 'nested'), { recursive: true })
  await fs.writeFile(path.join(dir, 'docs', 'a.md'), 'inside')
  await fs.writeFile(path.join(dir, 'docs', 'nested', 'b.md'), 'inside too')
  await fs.writeFile(path.join(outside, 'a.md'), 'OUTSIDE SECRET, long enough to tell apart')
  await fs.mkdir(path.join(outside, 'nested'))
  await fs.writeFile(path.join(outside, 'nested', 'b.md'), 'keep me')
})

afterEach(async () => {
  spy?.mockRestore()
  spy = null
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

const swapDocs = () => replaceWithLink(path.join(dir, 'docs'), outside)

async function codeOf(work: Promise<unknown>): Promise<string> {
  const err = await work.then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(LocationFileError)
  return (err as LocationFileError).code
}

describe('a directory swapped for a link after the check', () => {
  it('statFile answers nothing about the file outside', async () => {
    spy = swapAfterCheck(path.join(dir, 'docs'), swapDocs)
    expect(await codeOf(statFile({ loc, relPath: 'docs/a.md' }))).toBe('outside')
  })

  it('listFiles lists nothing of the directory outside', async () => {
    spy = swapAfterCheck(path.join(dir, 'docs'), swapDocs)
    const listed = await listFiles({ loc, subPath: 'docs' }).catch((e: unknown) => e)
    expect(listed).toBeInstanceOf(LocationFileError)
    expect((listed as LocationFileError).code).toBe('outside')
  })

  it('seedFiles writes nothing outside', async () => {
    spy = swapAfterCheck(path.join(dir, 'docs'), swapDocs)
    expect(await codeOf(seedFiles({ loc, files: [{ relPath: 'docs/new.md', content: 'seeded', ifAbsent: true }] }))).toBe('outside')
    const leaked = await fs.readFile(path.join(outside, 'new.md'), 'utf8').catch(() => '')
    expect(leaked).not.toContain('seeded')
  })

  it('ensureDir refuses a directory that landed outside', async () => {
    spy = swapAfterCheck(path.join(dir, 'docs'), swapDocs)
    expect(await codeOf(ensureDir({ loc, subPath: 'docs/made' }))).toBe('outside')
  })
})

describe('a link planted at the last part of a path', () => {
  it('seedFiles skips a dangling link rather than creating what it points at', async () => {
    await fs.symlink(path.join(outside, 'created.md'), path.join(dir, 'docs', 'dangling.md'))
    const result = await seedFiles({ loc, files: [{ relPath: 'docs/dangling.md', content: 'seeded', ifAbsent: true }] })
    expect(result).toEqual({ written: [], skipped: ['docs/dangling.md'] })
    await expect(fs.access(path.join(outside, 'created.md'))).rejects.toThrow()
  })
})

describe('legitimate paths behave as before', () => {
  it('lists, stats, seeds and makes directories at nested paths', async () => {
    expect((await listFiles({ loc, subPath: 'docs' })).entries.map(e => e.name)).toEqual(['nested', 'a.md'])
    expect(await statFile({ loc, relPath: 'docs/nested/b.md' })).toMatchObject({ name: 'b.md', kind: 'file', size: 10 })
    expect(await seedFiles({ loc, files: [{ relPath: 'x/y/z.md', content: 'z', ifAbsent: true }] }))
      .toEqual({ written: ['x/y/z.md'], skipped: [] })
    expect(await fs.readFile(path.join(dir, 'x', 'y', 'z.md'), 'utf8')).toBe('z')
    expect(await ensureDir({ loc, subPath: 'p/q' })).toEqual({ created: true })
    expect(await ensureDir({ loc, subPath: 'p/q' })).toEqual({ created: false })
  })
})

describe('location.remove against a swap mid-delete', () => {
  const originalLstat = fs.lstat
  const originalReaddir = fs.readdir

  it('a subdirectory swapped for a link after it was seen is never followed', async () => {
    const nested = path.join(dir, 'docs', 'nested')
    let done = false
    spy = vi.spyOn(fs, 'lstat').mockImplementation((async (p: string, opts?: object) => {
      const result = await originalLstat(p, opts as never)
      const child = String(p)
      // By path elsewhere; through the parent's descriptor on Linux.
      const isNested = child.endsWith(`${path.sep}docs${path.sep}nested`) || /^\/proc\/self\/fd\/\d+\/nested$/.test(child)
      if (!done && isNested && !(opts as { bigint?: boolean } | undefined)?.bigint) {
        done = true
        await replaceWithLink(nested, path.join(outside, 'nested'))
      }
      return result
    }) as typeof fs.lstat)
    await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1' }, wholeOwner: true }).catch(() => {})
    expect(done).toBe(true)
    expect(await fs.readFile(path.join(outside, 'nested', 'b.md'), 'utf8')).toBe('keep me')
    expect(await fs.readFile(path.join(outside, 'a.md'), 'utf8')).toContain('OUTSIDE SECRET')
  })

  it('a directory swapped for a link after it was listed has nothing removed through it', async () => {
    const docs = path.join(dir, 'docs')
    let done = false
    spy = vi.spyOn(fs, 'readdir').mockImplementation((async (p: string, opts?: object) => {
      const result = await originalReaddir(p, opts as never)
      // By path elsewhere; through the descriptor on Linux, which names it.
      const listed = String(p).startsWith('/proc/self/fd/') ? await fs.readlink(p).catch(() => '') : String(p)
      if (!done && listed.endsWith(`${path.sep}docs`)) {
        done = true
        await replaceWithLink(docs, outside)
      }
      return result
    }) as typeof fs.readdir)
    await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1' }, wholeOwner: true }).catch(() => {})
    expect(done).toBe(true)
    expect(await fs.readFile(path.join(outside, 'a.md'), 'utf8')).toContain('OUTSIDE SECRET')
    expect(await fs.readFile(path.join(outside, 'nested', 'b.md'), 'utf8')).toBe('keep me')
  })

  it('still removes a whole owner with nested content and links planted inside it', async () => {
    await fs.symlink(outside, path.join(dir, 'docs', 'escape'))
    await fs.symlink(path.join(outside, 'a.md'), path.join(dir, 'docs', 'nested', 'file-link'))
    expect(await removeLocation({ loc: { ownerType: 'project', ownerId: 'proj-1' }, wholeOwner: true })).toEqual({ removed: true })
    await expect(fs.lstat(ownerDir('project', 'proj-1'))).rejects.toThrow()
    expect(await fs.readFile(path.join(outside, 'a.md'), 'utf8')).toContain('OUTSIDE SECRET')
    expect(await fs.readFile(path.join(outside, 'nested', 'b.md'), 'utf8')).toBe('keep me')
  })
})
