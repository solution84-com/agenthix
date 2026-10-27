import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FIND_FILES_MAX_FRAGMENT, FIND_FILES_MAX_RESULTS, LOCATION_FILE_METHODS, LocationFileError, type LocationRef } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import { findBelow, findFiles, FIND_FILES_PARAMS_SHAPE, type FindLimits } from '../findFiles'
import { channelMethods } from '../../hq/channelMethods'
import { locationDir } from '../paths'

const loc: LocationRef = { ownerType: 'project', ownerId: 'proj-find' }
let root: string
let dir: string
let outside: string
const savedSiteRoot = process.env.SITE_ROOT

async function write(rel: string, content = 'x', when?: string) {
  const at = path.join(dir, rel)
  await fs.mkdir(path.dirname(at), { recursive: true })
  await fs.writeFile(at, content)
  if (when) await fs.utimes(at, new Date(when), new Date(when))
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-find-'))
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'site-find-out-'))
  process.env.SITE_ROOT = root
  dir = locationDir(loc)
  await fs.mkdir(dir, { recursive: true })
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
  await fs.rm(outside, { recursive: true, force: true })
})

describe('location.findFiles @SC-1503', () => {
  it('is registered on the control channel', () => {
    expect(channelMethods[LOCATION_FILE_METHODS.findFiles]).toBeTypeOf('function')
  })

  it('answers names that start with the fragment before those that contain it, case-insensitively, each newest first', async () => {
    await write('reports/q3-report.md', 'a', '2026-01-01T00:00:00Z')
    await write('Report-old.pdf', 'b', '2025-01-01T00:00:00Z')
    await write('report-new.pdf', 'c', '2026-06-01T00:00:00Z')
    await write('notes.md')
    const { files, truncated } = await findFiles({ loc, fragment: '  REPORT ' })
    expect(truncated).toBe(false)
    expect(files.map(f => [f.path, f.match])).toEqual([
      ['report-new.pdf', 'starts'], ['Report-old.pdf', 'starts'], ['reports/q3-report.md', 'contains'],
    ])
    expect(files[2]).toMatchObject({ name: 'q3-report.md', folder: 'reports', kind: 'file', size: 1 })
  })

  it('matches the file name, not its folder', async () => {
    await write('budget/plan.md')
    const { files } = await findFiles({ loc, fragment: 'budget' })
    expect(files).toEqual([])
  })

  it('answers the most recently changed files for an empty fragment', async () => {
    await write('a.md', 'a', '2026-01-01T00:00:00Z')
    await write('deep/b.md', 'b', '2026-03-01T00:00:00Z')
    await write('c.md', 'c', '2026-02-01T00:00:00Z')
    const { files } = await findFiles({ loc, fragment: '' })
    expect(files.map(f => f.path)).toEqual(['deep/b.md', 'c.md', 'a.md'])
    expect(files.every(f => f.match === 'recent')).toBe(true)
  })

  it(`answers at most ${FIND_FILES_MAX_RESULTS} files`, async () => {
    for (let i = 0; i < FIND_FILES_MAX_RESULTS + 5; i++) await write(`f${i}.txt`)
    const { files } = await findFiles({ loc, fragment: 'f' })
    expect(files).toHaveLength(FIND_FILES_MAX_RESULTS)
  })

  it('skips .git and node_modules', async () => {
    await write('.git/config-match')
    await write('node_modules/pkg/match.js')
    await write('src/match.ts')
    const { files } = await findFiles({ loc, fragment: 'match' })
    expect(files.map(f => f.path)).toEqual(['src/match.ts'])
  })

  it('never follows a symbolic link out of the location, to a file or a folder @SC-1567', async () => {
    await fs.writeFile(path.join(outside, 'secret.txt'), 'outside')
    await fs.mkdir(path.join(outside, 'tree'))
    await fs.writeFile(path.join(outside, 'tree', 'secret-deep.txt'), 'outside')
    await fs.symlink(path.join(outside, 'secret.txt'), path.join(dir, 'secret-link.txt'))
    await fs.symlink(path.join(outside, 'tree'), path.join(dir, 'linked-tree'))
    await write('secret-inside.txt')
    const result = await findFiles({ loc, fragment: 'secret' })
    expect(result.files.map(f => f.path)).toEqual(['secret-inside.txt'])
    expect(JSON.stringify(result)).not.toContain(outside)
    expect(JSON.stringify(result)).not.toContain(root)
  })

  it('ends on a symbolic link loop instead of walking it', async () => {
    await write('loop/inner.md')
    await fs.symlink('..', path.join(dir, 'loop', 'again'))
    await fs.symlink(path.join(dir, 'loop'), path.join(dir, 'loop', 'self'))
    const { files, truncated } = await findFiles({ loc, fragment: 'inner' })
    expect(files.map(f => f.path)).toEqual(['loop/inner.md'])
    expect(truncated).toBe(false)
  })

  it('takes a fragment with .. as a name to match, never a path', async () => {
    await fs.writeFile(path.join(outside, 'x.md'), 'outside')
    await write('a..b.md')
    const { files } = await findFiles({ loc, fragment: '../' })
    expect(files).toEqual([])
    expect((await findFiles({ loc, fragment: '..' })).files.map(f => f.path)).toEqual(['a..b.md'])
  })

  it("refuses a location whose own folder has been replaced by a link out", async () => {
    await fs.rm(dir, { recursive: true })
    await fs.writeFile(path.join(outside, 'planted.md'), 'outside')
    await fs.symlink(outside, dir)
    const err = await findFiles({ loc, fragment: 'planted' }).catch(e => e)
    expect(err).toBeInstanceOf(LocationFileError)
    expect((err as LocationFileError).code).toBe('outside')
    expect((err as Error).message).not.toContain(outside)
  })

  it('refuses an owner id that tries to climb out', async () => {
    const err = await findFiles({ loc: { ownerType: 'project', ownerId: '../x' }, fragment: 'a' }).catch(e => e)
    expect((err as LocationFileError).code).toBe('outside')
  })

  it('answers nothing for a location not made yet', async () => {
    await fs.rm(dir, { recursive: true })
    expect(await findFiles({ loc, fragment: 'a' })).toEqual({ files: [], truncated: false })
  })

  it('refuses a fragment over the cap, and params of the wrong shape, as invalid', async () => {
    const long = await findFiles({ loc, fragment: 'a'.repeat(FIND_FILES_MAX_FRAGMENT + 1) }).catch(e => e)
    expect((long as LocationFileError).code).toBe('invalid')
    const shape = await findFiles({ loc, fragment: 7 }).catch(e => e)
    expect((shape as LocationFileError).code).toBe('invalid')
  })

  it('carries no caller', () => {
    expect(Object.keys(FIND_FILES_PARAMS_SHAPE).sort()).toEqual(['fragment', 'loc'])
  })
})

describe('the walk is bounded @SC-1504', () => {
  const limits = (over: Partial<FindLimits>): FindLimits => ({
    maxEntries: 10_000, maxMs: 10_000, maxDepth: 12, maxResults: 20, now: Date.now, ...over,
  })

  it('stops at the entry cap and says so', async () => {
    for (let i = 0; i < 10; i++) await write(`n${i}.md`)
    const real = await fs.realpath(dir)
    const result = await findBelow(real, 'n', limits({ maxEntries: 4 }))
    expect(result.truncated).toBe(true)
    expect(result.files).toHaveLength(4)
  })

  it('stops when its time is up and answers what it found', async () => {
    await write('a/one.md')
    await write('b/one-more.md')
    let t = 0
    const real = await fs.realpath(dir)
    const result = await findBelow(real, 'one', limits({ maxMs: 2, now: () => (t += 1) }))
    expect(result.truncated).toBe(true)
  })

  it('goes no deeper than its depth', async () => {
    await write('d1/d2/d3/deep.md')
    await write('d1/shallow-deep.md')
    const real = await fs.realpath(dir)
    const result = await findBelow(real, 'deep', limits({ maxDepth: 1 }))
    expect(result.files.map(f => f.path)).toEqual(['d1/shallow-deep.md'])
    expect(result.truncated).toBe(true)
  })
})
