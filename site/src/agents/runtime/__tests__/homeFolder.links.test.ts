/**
 * A run can rename its home's `.claude` folder and put a link in its place, or replace a folder inside it. No write,
 * removal or read the site makes in a harness home may then reach the link's target: another person's home, or
 * anything outside. What the site stages for a run is no longer in the home at all (adr-0173).
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
import { ensureRealFolders, removeFromRunStaging } from '../homeFolder'
import { writeCredentialFile } from '../credentialFile'

let root: string
let mine: string
let other: string
let staging: string
beforeEach(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'home-links-')))
  mine = path.join(root, 'mine')
  other = path.join(root, 'other')
  staging = path.join(root, 'run-staging', 'mine')
  await fs.mkdir(path.join(mine, '.claude'), { recursive: true })
  await fs.mkdir(path.join(other, '.claude', 'memory'), { recursive: true })
  await fs.writeFile(path.join(other, '.claude', 'memory', 'pinned.md'), 'theirs')
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const claudeOf = (home: string) => path.join(home, '.claude')
const ITEM: PinnedMemoryItem = { key: 'k', scope: 'agent_person', title: 'Mine', body: 'my pinned item' }
const runStaging = () => ({ serverDir: staging, visibleDir: '/run/staging', shared: false })

/** Every file under `dir`, with its content, so a test can say nothing in it changed. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const entry of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath, entry.name)
    out[path.relative(dir, full)] = entry.isFile() ? await fs.readFile(full, 'utf-8') : entry.isDirectory() ? '<dir>' : '<other>'
  }
  return out
}

/** What a run can do to its own home: rename `.claude` and put a symlink to another home in its place. */
const plants: Array<[string, () => Promise<void>]> = [
  ['`.claude` renamed and replaced by a link to another home', async () => {
    await fs.rename(claudeOf(mine), path.join(mine, '.claude-old'))
    await fs.symlink(claudeOf(other), claudeOf(mine))
  }],
]

describe('pinned memory is written into run staging, outside the home a run can change (adr-0173)', () => {
  it('is written, read at /run/staging, cleared when left behind and removed, whatever the run did to its home', async () => {
    await plants[0][1]()
    const before = await snapshot(other)
    expect(await writePinnedMemory(runStaging(), 's1', [ITEM])).toBe('/run/staging/pinned-memory/s1/pinned.md')
    expect(await fs.readFile(path.join(staging, 'pinned-memory', 's1', 'pinned.md'), 'utf-8')).toContain('my pinned item')
    await fs.mkdir(path.join(staging, 'pinned-memory', 'gone'))
    await writePinnedMemory(runStaging(), 's2', undefined)
    await expect(fs.lstat(path.join(staging, 'pinned-memory', 'gone'))).rejects.toMatchObject({ code: 'ENOENT' })
    await releasePinnedMemory(staging, 's1')
    await releasePinnedMemory(staging, 's2')
    expect(await fs.readdir(path.join(staging, 'pinned-memory'))).toEqual([])
    expect(await snapshot(other)).toEqual(before)
  })
})

describe('removing from run staging', () => {
  it('refuses a path that is not an entry of a run staging folder', async () => {
    await expect(removeFromRunStaging(path.join(claudeOf(mine), 'projects'))).rejects.toThrow(/outside run staging/)
  })

  it('a missing run staging is nothing to remove', async () => {
    await expect(removeFromRunStaging(path.join(staging, 'skills', 'skills-x'))).resolves.toBeUndefined()
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

describe('before a container mounts anything inside a home', () => {
  it('a folder on the way that is a link is replaced by a real folder, made from the home down', async () => {
    await plants[0][1]()
    await fs.mkdir(path.join(claudeOf(other), '.tmp'), { recursive: true })
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
