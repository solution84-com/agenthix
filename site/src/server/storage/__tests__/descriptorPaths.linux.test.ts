/**
 * The Linux descriptor paths, for real: the ones the site's container image
 * runs, and the ones every other test here can only reach with a mocked
 * platform. Nothing is mocked — no platform, no `/proc` lookup, no file
 * system. Real files, real links, and real swaps, staged by spying on a step
 * only to know WHEN to swap (the spy calls straight through to the real
 * function).
 *
 * Skipped anywhere but Linux; run on its own with
 *   npx vitest run src/server/storage/__tests__/descriptorPaths.linux.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { LocationFileError, type LocationRef } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import { readContainedFile, writeContainedFile, DESCRIPTOR_PATHS_PINNED } from '../../../agents/runtime/containedFile'
import { listFiles } from '../locationFileMethods'
import { removeLocation } from '../locationRemove'
import { locationDir, ownerDir } from '../paths'
import { swapAfterCheck, replaceWithLink } from './swapAfterCheck'

const LABEL = 'outside the storage this run works in'
const loc: LocationRef = { ownerType: 'project', ownerId: 'proj-1' }
const PROC_ENTRY = /^\/proc\/self\/fd\/\d+\/([^/]+)$/

let root: string
let outside: string
let dir: string
let spy: MockInstance | null = null
const savedSiteRoot = process.env.SITE_ROOT
const originalLstat = fs.lstat
const originalReaddir = fs.readdir

const exists = (p: string) => originalLstat(p).then(() => true, () => false)

beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-')))
  outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'site-outside-')))
  process.env.SITE_ROOT = root
  dir = locationDir(loc)
  await fs.mkdir(path.join(dir, 'docs', 'nested'), { recursive: true })
  await fs.writeFile(path.join(dir, 'docs', 'a.md'), 'inside')
  await fs.writeFile(path.join(dir, 'docs', 'nested', 'b.md'), 'inside too')
  await fs.writeFile(path.join(outside, 'a.md'), 'OUTSIDE SECRET')
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

async function outsideIsIntact() {
  expect(await fs.readFile(path.join(outside, 'a.md'), 'utf8')).toBe('OUTSIDE SECRET')
  expect(await fs.readFile(path.join(outside, 'nested', 'b.md'), 'utf8')).toBe('keep me')
}

describe.skipIf(process.platform !== 'linux')('on Linux, through the descriptor', () => {
  it('acts through /proc/self/fd here, which is what makes the rest of this file mean anything', () => {
    expect(DESCRIPTOR_PATHS_PINNED).toBe(true)
  })

  describe('the native file tools', () => {
    it('read and write a nested path', async () => {
      await writeContainedFile(dir, 'x/y/z.md', 'deep', LABEL)
      expect(await readContainedFile(dir, 'x/y/z.md', LABEL)).toBe('deep')
    })

    it('refuse a read when a parent directory is swapped for a link after the check', async () => {
      spy = swapAfterCheck(path.join(dir, 'docs'), () => replaceWithLink(path.join(dir, 'docs'), outside))
      await expect(readContainedFile(dir, 'docs/a.md', LABEL)).rejects.toThrow(`Forbidden: ${LABEL}`)
    })

    it('refuse a read when the file itself is swapped for a link after the check', async () => {
      spy = swapAfterCheck(path.join(dir, 'docs'), async () => {
        await fs.rm(path.join(dir, 'docs', 'a.md'))
        await fs.symlink(path.join(outside, 'a.md'), path.join(dir, 'docs', 'a.md'))
      })
      await expect(readContainedFile(dir, 'docs/a.md', LABEL)).rejects.toThrow(`Forbidden: ${LABEL}`)
    })

    it('refuse a write when a parent directory is swapped for a link, leaving the outside file untouched', async () => {
      spy = swapAfterCheck(path.join(dir, 'docs'), () => replaceWithLink(path.join(dir, 'docs'), outside))
      await expect(writeContainedFile(dir, 'docs/a.md', 'malicious', LABEL)).rejects.toThrow(`Forbidden: ${LABEL}`)
      await outsideIsIntact()
    })
  })

  describe('location.listFiles', () => {
    it('lists through the open directory, keeping a link inside and dropping one outside', async () => {
      await fs.symlink(path.join(dir, 'docs', 'nested'), path.join(dir, 'docs', 'inside-link'))
      await fs.symlink(outside, path.join(dir, 'docs', 'outside-link'))
      let listedThroughProc = false
      spy = vi.spyOn(fs, 'readdir').mockImplementation((async (p: string, opts?: object) => {
        if (String(p).startsWith('/proc/self/fd/')) listedThroughProc = true
        return originalReaddir(p, opts as never)
      }) as typeof fs.readdir)
      const { entries } = await listFiles({ loc, subPath: 'docs' })
      expect(listedThroughProc).toBe(true)
      expect(entries.map(e => [e.name, e.kind])).toEqual([
        ['inside-link', 'directory'],
        ['nested', 'directory'],
        ['a.md', 'file'],
      ])
    })

    it('refuses a directory swapped for a link after the check', async () => {
      spy = swapAfterCheck(path.join(dir, 'docs'), () => replaceWithLink(path.join(dir, 'docs'), outside))
      const err = await listFiles({ loc, subPath: 'docs' }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(LocationFileError)
      expect((err as LocationFileError).code).toBe('outside')
    })
  })

  describe('location.remove', () => {
    it('unlinks a link planted to an outside directory mid-walk, and removes nothing outside', async () => {
      // Planted while the owner directory is being listed — before the walk has
      // reached `docs`, so the walk meets the link when it lists `docs`.
      let planted = false
      spy = vi.spyOn(fs, 'readdir').mockImplementation((async (p: string, opts?: object) => {
        const result = await originalReaddir(p, opts as never)
        if (!planted && String(p).startsWith('/proc/self/fd/')) {
          const listed = await fs.readlink(p).catch(() => '')
          if (listed === ownerDir('project', 'proj-1')) {
            planted = true
            await fs.symlink(outside, path.join(dir, 'docs', 'escape'))
          }
        }
        return result
      }) as typeof fs.readdir)
      expect(await removeLocation({ loc, wholeOwner: true })).toEqual({ removed: true })
      expect(planted).toBe(true)
      expect(await exists(ownerDir('project', 'proj-1'))).toBe(false)
      await outsideIsIntact()
    })

    it('never follows a directory swapped for a link after the walk has seen it', async () => {
      let swapped = false
      spy = vi.spyOn(fs, 'lstat').mockImplementation((async (p: string, opts?: object) => {
        const result = await originalLstat(p, opts as never)
        const name = PROC_ENTRY.exec(String(p))?.[1]
        if (!swapped && name === 'nested') {
          swapped = true
          await replaceWithLink(path.join(dir, 'docs', 'nested'), path.join(outside, 'nested'))
        }
        return result
      }) as typeof fs.lstat)
      await removeLocation({ loc, wholeOwner: true }).catch(() => {})
      expect(swapped).toBe(true)
      await outsideIsIntact()
    })

    it('keeps removing inside the directory it opened when that directory is swapped for a link mid-walk', async () => {
      const docs = path.join(dir, 'docs')
      // Files only, so the order the listing comes back in cannot matter.
      await fs.rm(path.join(docs, 'nested'), { recursive: true })
      await fs.writeFile(path.join(docs, 'c.md'), 'inside')
      let swapped = false
      spy = vi.spyOn(fs, 'readdir').mockImplementation((async (p: string, opts?: object) => {
        const result = await originalReaddir(p, opts as never)
        if (!swapped && String(p).startsWith('/proc/self/fd/') && (await fs.readlink(p).catch(() => '')) === docs) {
          swapped = true
          await replaceWithLink(docs, outside)
        }
        return result
      }) as typeof fs.readdir)
      await removeLocation({ loc, wholeOwner: true }).catch(() => {})
      expect(swapped).toBe(true)
      await outsideIsIntact()
      // The entries the listing named were removed from the directory that was
      // open — now at `docs.moved` — not from where the link points.
      expect(await exists(path.join(dir, 'docs.moved', 'a.md'))).toBe(false)
      expect(await exists(path.join(dir, 'docs.moved', 'c.md'))).toBe(false)
    })
  })
})
