/**
 * ADR-0058 replaced the per-person memory directory with memory held by hq.
 * Whatever survived an upgrade is moved aside rather than imported: its content
 * is free-form text of unbounded size, the store that replaces it holds short
 * curated items, and nobody is present at boot to accept an import. The files
 * stay readable so anything worth keeping can be re-added by hand.
 *
 * TWO source locations, not one. `agents/<handle>/users/` is ADR-0048's
 * partition. `agents/<handle>/workspace/.private/memory/users/` is the
 * convention ADR-0048 replaced, and it sits INSIDE the workspace, which is
 * bind-mounted rw into every run of that agent — so a directory left there is
 * one person's memory readable by every run, including runs invoked by someone
 * else. A one-time migration used to move that one out; this sweep covers it
 * directly now that the migration is gone.
 *
 * Real filesystem I/O against a scratch SITE_ROOT, the same reasoning
 * toolRegistry.test.ts uses: this is entirely readdir/stat/rename, so a mocked
 * fs would prove nothing about whether the directories actually move.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'

import { setAsideSupersededMemory, SUPERSEDED_MEMORY_DIRNAME } from '../memorySupersede'

let scratchRoot: string
const savedSiteRoot = process.env.SITE_ROOT

const HANDLE = 'kernel'
const agentDir = () => path.join(scratchRoot, 'agents', HANDLE)
const supersededDir = () => path.join(agentDir(), SUPERSEDED_MEMORY_DIRNAME)

/** ADR-0048's partition, and where it is set aside to. */
const partitionFor = (userId: string) => path.join(agentDir(), 'users', userId)
const setAsideFor = (userId: string) => path.join(supersededDir(), 'partition', userId)

/** The pre-ADR-0048 in-workspace directory, and where it is set aside to. */
const legacyFor = (userId: string) =>
  path.join(agentDir(), 'workspace', '.private', 'memory', 'users', userId)
const setAsideLegacyFor = (userId: string) => path.join(supersededDir(), 'in-workspace', userId)

async function writeFileAt(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(() => true).catch(() => false)
}

beforeEach(async () => {
  scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'memorySupersede-'))
  process.env.SITE_ROOT = scratchRoot
})

afterEach(async () => {
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(scratchRoot, { recursive: true, force: true })
})

describe('setting aside a superseded memory partition', () => {
  it('moves the directory out of the way with its content intact', async () => {
    await writeFileAt(path.join(partitionFor('user-1'), 'NOTES.md'), 'what the agent remembered')

    const moved = await setAsideSupersededMemory(HANDLE)

    expect(moved).toBe(1)
    expect(await exists(partitionFor('user-1'))).toBe(false)
    expect(await fs.readFile(path.join(setAsideFor('user-1'), 'NOTES.md'), 'utf8')).toBe('what the agent remembered')
  })

  it('moves every person\'s directory, not just the first', async () => {
    await writeFileAt(path.join(partitionFor('user-a'), 'NOTES.md'), 'a')
    await writeFileAt(path.join(partitionFor('user-b'), 'NOTES.md'), 'b')

    expect(await setAsideSupersededMemory(HANDLE)).toBe(2)
    expect(await fs.readFile(path.join(setAsideFor('user-a'), 'NOTES.md'), 'utf8')).toBe('a')
    expect(await fs.readFile(path.join(setAsideFor('user-b'), 'NOTES.md'), 'utf8')).toBe('b')
  })

  it('does nothing, without failing, when there is no partition directory at all', async () => {
    await fs.mkdir(path.join(scratchRoot, 'agents', HANDLE, 'workspace'), { recursive: true })

    expect(await setAsideSupersededMemory(HANDLE)).toBe(0)
    expect(await exists(path.join(scratchRoot, 'agents', HANDLE, SUPERSEDED_MEMORY_DIRNAME))).toBe(false)
  })

  it('does nothing for an agent with no directory on this site at all', async () => {
    await expect(setAsideSupersededMemory('never-ran-here')).resolves.toBe(0)
  })

  it('is idempotent — a second boot finds nothing and destroys nothing', async () => {
    await writeFileAt(path.join(partitionFor('user-1'), 'NOTES.md'), 'kept')

    expect(await setAsideSupersededMemory(HANDLE)).toBe(1)
    expect(await setAsideSupersededMemory(HANDLE)).toBe(0)
    expect(await fs.readFile(path.join(setAsideFor('user-1'), 'NOTES.md'), 'utf8')).toBe('kept')
  })

  it('never overwrites something already set aside — it keeps both, suffixed', async () => {
    await writeFileAt(path.join(setAsideFor('user-1'), 'NOTES.md'), 'set aside earlier')
    await writeFileAt(path.join(partitionFor('user-1'), 'NOTES.md'), 'found again')

    expect(await setAsideSupersededMemory(HANDLE)).toBe(1)

    expect(await fs.readFile(path.join(setAsideFor('user-1'), 'NOTES.md'), 'utf8')).toBe('set aside earlier')
    const siblings = await fs.readdir(path.join(supersededDir(), 'partition'))
    const second = siblings.find(name => name.startsWith('user-1-'))
    expect(second).toBeDefined()
    expect(await fs.readFile(path.join(supersededDir(), 'partition', second!, 'NOTES.md'), 'utf8'))
      .toBe('found again')
  })

  it('ignores a stray file at the partition level rather than treating it as a person', async () => {
    await writeFileAt(path.join(agentDir(), 'users', 'INDEX.md'), 'not a person')

    expect(await setAsideSupersededMemory(HANDLE)).toBe(0)
    expect(await exists(path.join(agentDir(), 'users', 'INDEX.md'))).toBe(true)
  })

  it('ignores a symlink at the partition level rather than following it to a person', async () => {
    const realTarget = path.join(scratchRoot, 'outside-a-person-dir')
    await writeFileAt(path.join(realTarget, 'NOTES.md'), 'reached through a link')
    await fs.mkdir(path.join(agentDir(), 'users'), { recursive: true })
    await fs.symlink(realTarget, path.join(agentDir(), 'users', 'user-1'), 'dir')

    expect(await setAsideSupersededMemory(HANDLE)).toBe(0)
    expect(await exists(path.join(agentDir(), 'users', 'user-1'))).toBe(true)
    expect(await exists(realTarget)).toBe(true)
  })

  it('leaves the empty partition directory behind rather than removing anything it did not move', async () => {
    await writeFileAt(path.join(partitionFor('user-1'), 'NOTES.md'), 'moved')
    await setAsideSupersededMemory(HANDLE)

    // Nothing is destroyed by this sweep — an operator deletes the husk.
    expect(await exists(path.join(agentDir(), 'users'))).toBe(true)
  })
})

// This half is the one that matters on an install that never upgraded through
// ADR-0048: the workspace is bind-mounted rw into every run of this agent, so a
// directory left here is one person's memory readable by every run, invoked by
// anyone. A one-time migration used to move it out; these cases are what
// replace it now that the migration is gone.
describe('setting aside the pre-ADR-0048 in-workspace memory', () => {
  it('moves it out of the workspace, with its content intact', async () => {
    await writeFileAt(path.join(legacyFor('user-1'), 'NOTES.md'), 'readable in every run until now')

    expect(await setAsideSupersededMemory(HANDLE)).toBe(1)

    expect(await exists(legacyFor('user-1'))).toBe(false)
    expect(await fs.readFile(path.join(setAsideLegacyFor('user-1'), 'NOTES.md'), 'utf8'))
      .toBe('readable in every run until now')
  })

  it('leaves nothing of any person under the workspace once it has run', async () => {
    await writeFileAt(path.join(legacyFor('user-a'), 'NOTES.md'), 'a')
    await writeFileAt(path.join(legacyFor('user-b'), 'NOTES.md'), 'b')

    expect(await setAsideSupersededMemory(HANDLE)).toBe(2)

    const workspaceUsersDir = path.join(agentDir(), 'workspace', '.private', 'memory', 'users')
    expect(await fs.readdir(workspaceUsersDir)).toEqual([])
  })

  it('sweeps both locations in one pass, keeping each under its own name', async () => {
    await writeFileAt(path.join(partitionFor('user-1'), 'NOTES.md'), 'from the partition')
    await writeFileAt(path.join(legacyFor('user-1'), 'NOTES.md'), 'from the workspace')

    // The same person in both places: two moves, and neither overwrites the
    // other, because the two conventions get their own subdirectory.
    expect(await setAsideSupersededMemory(HANDLE)).toBe(2)

    expect(await fs.readFile(path.join(setAsideFor('user-1'), 'NOTES.md'), 'utf8')).toBe('from the partition')
    expect(await fs.readFile(path.join(setAsideLegacyFor('user-1'), 'NOTES.md'), 'utf8')).toBe('from the workspace')
  })

  it('leaves .private/memory/projects alone — project knowledge is not a person\'s memory', async () => {
    await writeFileAt(
      path.join(agentDir(), 'workspace', '.private', 'memory', 'projects', 'alpha', 'NOTES.md'),
      'about the project, not about anyone',
    )

    expect(await setAsideSupersededMemory(HANDLE)).toBe(0)
    expect(await exists(path.join(agentDir(), 'workspace', '.private', 'memory', 'projects', 'alpha'))).toBe(true)
  })

  it('does nothing, without failing, when the agent has a workspace but no legacy directory', async () => {
    await writeFileAt(path.join(agentDir(), 'workspace', 'README.md'), 'just a workspace')

    expect(await setAsideSupersededMemory(HANDLE)).toBe(0)
    expect(await exists(supersededDir())).toBe(false)
  })
})

describe('a cross-device rename', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is logged loudly and distinctly from a plain warning, not swallowed into a zero count', async () => {
    await writeFileAt(path.join(partitionFor('user-1'), 'NOTES.md'), 'still needs a home')

    const renameSpy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(
      Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' }),
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const moved = await setAsideSupersededMemory(HANDLE)

    expect(moved).toBe(0)
    expect(renameSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0][0]).toContain('cross-device')
    expect(warnSpy).not.toHaveBeenCalled()
    // The file is exactly where it always was — nothing was destroyed by the
    // failed attempt.
    expect(await fs.readFile(path.join(partitionFor('user-1'), 'NOTES.md'), 'utf8')).toBe('still needs a home')
  })
})

describe('a handle that is not a bare directory name', () => {
  it('is refused rather than swept, even though the one caller today never sends one', async () => {
    await writeFileAt(path.join(partitionFor('user-1'), 'NOTES.md'), 'kernel, not the traversal target')

    await expect(setAsideSupersededMemory('../escaped-agent')).rejects.toThrow(/agents root/)

    // Refused before touching anything — kernel's own directory is untouched.
    expect(await exists(partitionFor('user-1'))).toBe(true)
  })
})
