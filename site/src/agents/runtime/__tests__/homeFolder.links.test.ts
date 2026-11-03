/**
 * A run can rename its home's `.claude` folder (the staging bind inside it moves with it) and put a link in its
 * place, or replace `.tmp` or a folder inside it. No write, removal or read the site makes in a harness home may
 * then reach the link's target: another person's home, or anything outside.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() })),
}))

import type { PinnedMemoryItem } from '@agenthix/core'
import { releasePinnedMemory, writePinnedMemory } from '../pinnedMemoryFiles'
import { ensureRealFolders, removeFromStaging, withStagingFolder } from '../homeFolder'
import { writeCredentialFile } from '../credentialFile'

let root: string
let mine: string
let other: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'home-links-')))
  mine = path.join(root, 'mine')
  other = path.join(root, 'other')
  await fs.mkdir(path.join(mine, '.claude', '.tmp'), { recursive: true })
  await fs.mkdir(path.join(other, '.claude', '.tmp', 'memory-s1'), { recursive: true })
  await fs.writeFile(path.join(other, '.claude', '.tmp', 'memory-s1', 'pinned.md'), 'theirs')
  await fs.mkdir(path.join(other, '.claude', '.tmp', 'memory-gone'))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const claudeOf = (home: string) => path.join(home, '.claude')
const ITEM: PinnedMemoryItem = { key: 'k', scope: 'agent_person', title: 'Mine', body: 'my pinned item' }
const home = () => ({ serverDir: claudeOf(mine), visibleDir: '/home/appuser/.claude', shared: false })

/** Every file under `dir`, with its content, so a test can say nothing in it changed. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const entry of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath, entry.name)
    out[path.relative(dir, full)] = entry.isFile() ? await fs.readFile(full, 'utf-8') : entry.isDirectory() ? '<dir>' : '<other>'
  }
  return out
}

/** The three ways a run can steer the site into `other`'s staging folder. */
const plants: Array<[string, () => Promise<void>]> = [
  ['`.claude` renamed and replaced by a link to another home', async () => {
    await fs.rename(claudeOf(mine), path.join(mine, '.claude-old'))
    await fs.symlink(claudeOf(other), claudeOf(mine))
  }],
  ['`.tmp` replaced by a link to another home\'s', async () => {
    await fs.rm(path.join(claudeOf(mine), '.tmp'), { recursive: true })
    await fs.symlink(path.join(claudeOf(other), '.tmp'), path.join(claudeOf(mine), '.tmp'))
  }],
  ['the session\'s own memory folder replaced by a link to another home\'s', async () => {
    await fs.symlink(path.join(claudeOf(other), '.tmp', 'memory-s1'), path.join(claudeOf(mine), '.tmp', 'memory-s1'))
  }],
]

describe('pinned memory never follows a link the run planted in its home', () => {
  for (const [what, plant] of plants) {
    it(`${what}: the write, the clearing of left-behind folders and the removal leave the other home alone`, async () => {
      await plant()
      const before = await snapshot(other)
      await writePinnedMemory(home(), 's1', [ITEM])
      await writePinnedMemory(home(), 's2', undefined)
      await releasePinnedMemory(claudeOf(mine), 's1')
      await releasePinnedMemory(claudeOf(mine), 's2')
      expect(await snapshot(other)).toEqual(before)
    })
  }

  it('a link where the session folder goes is removed when the run has nothing pinned, its target untouched', async () => {
    await plants[2][1]()
    await writePinnedMemory(home(), 's1', undefined)
    await releasePinnedMemory(claudeOf(mine), 's1')
    await expect(fs.lstat(path.join(claudeOf(mine), '.tmp', 'memory-s1'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await fs.readFile(path.join(claudeOf(other), '.tmp', 'memory-s1', 'pinned.md'), 'utf-8')).toBe('theirs')
  })

  it('a pinned.md planted as a link is replaced, not written through', async () => {
    const outside = path.join(root, 'outside.txt')
    await fs.writeFile(outside, 'untouched')
    await fs.mkdir(path.join(claudeOf(mine), '.tmp', 'memory-s1'))
    await fs.symlink(outside, path.join(claudeOf(mine), '.tmp', 'memory-s1', 'pinned.md'))
    expect(await writePinnedMemory(home(), 's1', [ITEM])).toBe('/home/appuser/.claude/.tmp/memory-s1/pinned.md')
    expect(await fs.readFile(outside, 'utf-8')).toBe('untouched')
    expect(await fs.readFile(path.join(claudeOf(mine), '.tmp', 'memory-s1', 'pinned.md'), 'utf-8')).toContain('my pinned item')
    await releasePinnedMemory(claudeOf(mine), 's1')
  })

  it('still writes and removes in a home whose folders are its own', async () => {
    expect(await writePinnedMemory(home(), 's1', [ITEM])).not.toBeNull()
    await releasePinnedMemory(claudeOf(mine), 's1')
    expect(await fs.readdir(path.join(claudeOf(mine), '.tmp'))).toEqual([])
  })
})

describe('the staging folder as the site opens it', () => {
  it('is refused, not followed, when `.claude` is a link', async () => {
    await plants[0][1]()
    await expect(withStagingFolder(claudeOf(mine), async () => 'reached', { create: true })).rejects.toThrow(/Forbidden/)
  })

  it('removing an entry of it leaves another home alone when `.tmp` is a link', async () => {
    await plants[1][1]()
    const before = await snapshot(other)
    await expect(removeFromStaging(path.join(claudeOf(mine), '.tmp', 'memory-s1'))).rejects.toThrow(/Forbidden/)
    expect(await snapshot(other)).toEqual(before)
  })

  it('removes a folder whose inner folder is a link without emptying the link\'s target', async () => {
    await fs.mkdir(path.join(claudeOf(mine), '.tmp', 'skills-x'))
    await fs.symlink(path.join(claudeOf(other), '.tmp'), path.join(claudeOf(mine), '.tmp', 'skills-x', 'inner'))
    const before = await snapshot(other)
    await removeFromStaging(path.join(claudeOf(mine), '.tmp', 'skills-x'))
    expect(await fs.readdir(path.join(claudeOf(mine), '.tmp'))).toEqual([])
    expect(await snapshot(other)).toEqual(before)
  })

  it('refuses a path that is not an entry of a staging folder', async () => {
    await expect(removeFromStaging(path.join(claudeOf(mine), 'projects'))).rejects.toThrow(/outside a staging folder/)
  })

  it('a missing staging folder is nothing to remove', async () => {
    await fs.rm(claudeOf(mine), { recursive: true })
    await expect(removeFromStaging(path.join(claudeOf(mine), '.tmp', 'memory-s1'))).resolves.toBeUndefined()
  })
})

describe('the credentials document is written into a Claude folder made where none was', () => {
  it('makes the folder, and refuses one that is a link', async () => {
    await fs.rm(claudeOf(mine), { recursive: true })
    await writeCredentialFile(claudeOf(mine), '{"a":1}')
    expect(await fs.readFile(path.join(claudeOf(mine), '.credentials.json'), 'utf-8')).toBe('{"a":1}')
    await plants[0][1]()
    await expect(writeCredentialFile(claudeOf(mine), '{"b":2}')).rejects.toThrow(/Forbidden/)
    await expect(fs.stat(path.join(claudeOf(other), '.credentials.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('before a container binds the staging folder', () => {
  it('a `.claude` or `.tmp` that is a link is replaced by a real folder, so Docker never binds what it leads to', async () => {
    await plants[0][1]()
    const before = await snapshot(other)
    await ensureRealFolders(mine, '.claude/.tmp')
    expect((await fs.lstat(claudeOf(mine))).isDirectory()).toBe(true)
    expect((await fs.lstat(path.join(claudeOf(mine), '.tmp'))).isDirectory()).toBe(true)

    await fs.rm(path.join(claudeOf(mine), '.tmp'), { recursive: true })
    await fs.symlink(path.join(claudeOf(other), '.tmp'), path.join(claudeOf(mine), '.tmp'))
    await ensureRealFolders(mine, '.claude/.tmp')
    expect((await fs.lstat(path.join(claudeOf(mine), '.tmp'))).isDirectory()).toBe(true)
    expect(await fs.readdir(path.join(claudeOf(mine), '.tmp'))).toEqual([])
    expect(await snapshot(other)).toEqual(before)
  })
})
