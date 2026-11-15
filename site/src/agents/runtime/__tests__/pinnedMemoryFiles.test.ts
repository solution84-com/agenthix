import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { RunMemory, RunMemoryItem } from '@agenthix/core'

vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(function () { return ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}))

import { writePinnedMemory, releasePinnedMemory, homeIsShared, runMemoryText } from '../pinnedMemoryFiles'
import { runStagingFor } from '../harnessHomes'
import type { ContainerKey } from '../containerTypes'

let root: string
let home: { serverDir: string; visibleDir: string; shared: boolean }
let started: string[]
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'pinned-memory-'))
  home = { serverDir: path.join(root, 'run-staging', 'u1'), visibleDir: '/run/staging', shared: false }
  await fs.mkdir(path.join(home.serverDir, 'pinned-memory'), { recursive: true })
  started = []
})
afterEach(async () => {
  for (const session of started) await releasePinnedMemory(home.serverDir, session)
  await fs.rm(root, { recursive: true, force: true })
})

/** A run's start, released again after the test as its end would be. */
async function start(session: string, memory: RunMemory | undefined, at = home) {
  started.push(session)
  return writePinnedMemory(at, session, memory)
}

const item = (over: Partial<RunMemoryItem> = {}): RunMemoryItem => ({
  key: 'tea-not-coffee', kind: 'fact', title: 'Drinks tea', body: 'Prefers tea over coffee, black.', ...over,
})
const found = (...items: RunMemoryItem[]): RunMemory => ({ items, hinted: [] })
const fileFor = (session: string) => path.join(home.serverDir, 'pinned-memory', session, 'pinned.md')

describe('pinned memory as a file in the run home @SC-2106 @SC-1014', () => {
  it('writes the items under the staging folder and names the file as the run sees it', async () => {
    const visible = await start('sess1', found(item(), item({ key: 'region', kind: 'rule', title: 'Region', body: 'EU only.' })))

    expect(visible).toBe('/run/staging/pinned-memory/sess1/pinned.md')
    const text = await fs.readFile(fileFor('sess1'), 'utf-8')
    expect(text).toContain('## Drinks tea')
    expect(text).toContain('Prefers tea over coffee, black.')
    expect(text).toContain('key `region`')
  })

  it('is refreshed at every start: the new set replaces the old whole', async () => {
    await start('sess1', found(item()))
    await start('sess1', found(item({ key: 'other', title: 'Other', body: 'Something else entirely.' })))

    const text = await fs.readFile(fileFor('sess1'), 'utf-8')
    expect(text).toContain('Something else entirely.')
    expect(text).not.toContain('Prefers tea')
    expect(await fs.readdir(path.dirname(fileFor('sess1')))).toEqual(['pinned.md'])
  })

  it('is removed when there are none, and names no file', async () => {
    await start('sess1', found(item()))

    expect(await start('sess1', undefined)).toBeNull()
    await expect(fs.stat(path.dirname(fileFor('sess1')))).rejects.toThrow()
    expect(await start('sess1', found())).toBeNull()
  })

  it('keeps one session\'s file apart from another\'s', async () => {
    await start('a', found(item({ body: 'For the first person only.' })))
    await start('b', found(item({ body: 'For the second person only.' })))
    await start('b', undefined)

    expect(await fs.readFile(fileFor('a'), 'utf-8')).toContain('first person')
  })

  it('refuses a session id that is not one path segment, without throwing out of the launch', async () => {
    expect(await start('../escape', found(item()))).toBeNull()
    await expect(fs.stat(path.join(home.serverDir, 'escape'))).rejects.toThrow()
  })

  it('is removed when the run ends', async () => {
    await writePinnedMemory(home, 'sess1', found(item()))
    await releasePinnedMemory(home.serverDir, 'sess1')

    await expect(fs.stat(path.dirname(fileFor('sess1')))).rejects.toThrow()
  })

  it('stays while another run of the same session is still going', async () => {
    await writePinnedMemory(home, 'sess1', found(item()))
    await writePinnedMemory(home, 'sess1', found(item()))
    await releasePinnedMemory(home.serverDir, 'sess1')
    expect(await fs.readFile(fileFor('sess1'), 'utf-8')).toContain('Drinks tea')

    await releasePinnedMemory(home.serverDir, 'sess1')
    await expect(fs.stat(path.dirname(fileFor('sess1')))).rejects.toThrow()
  })

  it('clears what a run that never ended left in the home, and nothing a running one holds', async () => {
    await fs.mkdir(path.dirname(fileFor('crashed')), { recursive: true })
    await fs.writeFile(fileFor('crashed'), 'Left by a run the site never saw end.')
    await fs.mkdir(path.join(home.serverDir, 'skills', 'skills-abc'), { recursive: true })
    await start('running', found(item({ body: 'Still in use.' })))

    await start('next', found(item()))

    await expect(fs.stat(path.dirname(fileFor('crashed')))).rejects.toThrow()
    expect(await fs.readFile(fileFor('running'), 'utf-8')).toContain('Still in use.')
    expect((await fs.stat(path.join(home.serverDir, 'skills', 'skills-abc'))).isDirectory()).toBe(true)
  })

  it('clears a crashed run\'s file even when the next start has nothing pinned', async () => {
    await fs.mkdir(path.dirname(fileFor('crashed')), { recursive: true })
    await fs.writeFile(fileFor('crashed'), 'Left behind.')

    await start('next', undefined)

    await expect(fs.stat(path.dirname(fileFor('crashed')))).rejects.toThrow()
  })

  it('says the items are read-only and where the rest is', () => {
    const text = runMemoryText(found(item()))
    expect(text).toContain('Read-only')
    expect(text).toContain('`recall`')
  })
})

describe('memory in a home more than one person runs in', () => {
  it('is a project\'s own home, which every task run in the project shares, and no person\'s', () => {
    expect(homeIsShared({ kind: 'project', projectId: 'p1' })).toBe(true)
    expect(homeIsShared({ kind: 'person', userId: 'u1' })).toBe(false)
  })

  it('is the run staging every container of that project mounts, so nothing about a person is written there', async () => {
    process.env.SITE_ROOT = root
    const key: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'p1', mode: 'rw', runner: { kind: 'project', projectId: 'p1' } }
    const projectHome = { serverDir: runStagingFor(key), visibleDir: '/run/staging', shared: true }
    started.push('a')
    try {
      expect(await writePinnedMemory(projectHome, 'a', found(item({ body: 'Eats no meat.' })))).toBeNull()
      const staged = path.join(root, 'run-staging', 'projects', 'p1', 'pinned-memory', 'a')
      await expect(fs.stat(staged)).rejects.toThrow()
    } finally {
      await releasePinnedMemory(projectHome.serverDir, 'a')
      delete process.env.SITE_ROOT
    }
  })
})

describe("a run's memory (ADR-0188)", () => {
  const memory: RunMemory = {
    items: [
      { key: 'tables', kind: 'rule', title: 'Comparing options', body: 'When comparing options, use a table.' },
      { key: 'job', kind: 'fact', title: 'Job hunting', body: 'Avery is looking for a new job.' },
    ],
    hinted: [{ key: 'host', title: 'Preferred host' }],
  }

  it('names a rule as one and what to recall by key', async () => {
    expect(await start('sess1', memory)).toBe('/run/staging/pinned-memory/sess1/pinned.md')
    const text = await fs.readFile(fileFor('sess1'), 'utf-8')
    expect(text).toContain('# Memory for this work')
    expect(text).toContain('_Rule · key `tables`_')
    expect(text).toContain('_Fact · key `job`_')
    expect(text).toContain('Preferred host [`host`]')
  })

  it('reads an unknown kind as a fact', () => {
    expect(runMemoryText({ items: [{ key: 'k', kind: 'later', title: 'T', body: 'B' }], hinted: [] })).toContain('_Fact · key `k`_')
  })

  it('writes nothing, and removes an earlier file, when the memory found is empty', async () => {
    await start('sess1', memory)
    expect(await start('sess1', { items: [], hinted: [] })).toBeNull()
    await expect(fs.stat(path.dirname(fileFor('sess1')))).rejects.toThrow()
  })

  it("writes none of it in a home more than one person's runs share", async () => {
    expect(await start('a', memory, { ...home, shared: true })).toBeNull()
    await expect(fs.stat(path.dirname(fileFor('a')))).rejects.toThrow()
  })
})
