import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { boundaryOverridePath, resolveBoundaryOverrideDir, readRegularFile, readBoundaryFile, readFileNoFollow, BOUNDARY_FILE_MAX_BYTES } from '../boundaryOverrides'

let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-')); process.env.SITE_ROOT = root })
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

const project = { ownerType: 'project' as const, ownerId: 'p1' }

describe('boundary overrides', () => {
  it('lives in the boundary\'s files home, keyed on the agent id', () => {
    expect(boundaryOverridePath(project, 'agent-1')).toEqual({
      filesHome: path.join(root, 'projects', 'p1', 'files'),
      dir: path.join(root, 'projects', 'p1', 'files', '.agents', 'agents', 'agent-1'),
    })
    expect(() => boundaryOverridePath(project, '../x')).toThrow(/agent id/)
  })

  it('resolves the directory when it exists', async () => {
    const { dir, filesHome } = boundaryOverridePath(project, 'agent-1')
    expect(await resolveBoundaryOverrideDir(project, 'agent-1')).toBeNull()
    await fs.mkdir(dir, { recursive: true })
    expect(await resolveBoundaryOverrideDir(project, 'agent-1')).toEqual({
      dir: await fs.realpath(dir),
      filesHome: await fs.realpath(filesHome),
    })
  })

  it('ignores an override directory that is a link leaving the files home', async () => {
    const { filesHome, dir } = boundaryOverridePath(project, 'agent-1')
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'))
    try {
      await fs.mkdir(path.dirname(dir), { recursive: true })
      await fs.symlink(outside, dir)
      expect(filesHome).toBe(path.join(root, 'projects', 'p1', 'files'))
      expect(await resolveBoundaryOverrideDir(project, 'agent-1')).toBeNull()
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('ignores a link at .agents itself', async () => {
    const { filesHome, dir } = boundaryOverridePath(project, 'agent-1')
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'))
    try {
      await fs.mkdir(path.join(outside, 'agents', 'agent-1'), { recursive: true })
      await fs.mkdir(filesHome, { recursive: true })
      await fs.symlink(outside, path.join(filesHome, '.agents'))
      expect(await resolveBoundaryOverrideDir(project, 'agent-1')).toBeNull()
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }

    // Real assertion, not a vacuous string check on a value the link never
    // touched: once the link at .agents is gone, a
    // legitimate override at the SAME dir resolves normally — proving the
    // null above was specifically the link, not a broader problem with this
    // test's layout.
    await fs.rm(path.join(filesHome, '.agents'), { force: true }) // the (now-dangling) symlink itself
    await fs.mkdir(dir, { recursive: true })
    expect(await resolveBoundaryOverrideDir(project, 'agent-1')).toEqual({
      dir: await fs.realpath(dir),
      filesHome: await fs.realpath(filesHome),
    })
  })

  it('ignores a link at .agents/agents', async () => {
    const { filesHome } = boundaryOverridePath(project, 'agent-1')
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'))
    try {
      await fs.mkdir(path.join(outside, 'agent-1'), { recursive: true })
      await fs.mkdir(path.join(filesHome, '.agents'), { recursive: true })
      await fs.symlink(outside, path.join(filesHome, '.agents', 'agents'))
      expect(await resolveBoundaryOverrideDir(project, 'agent-1')).toBeNull()
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('reads a regular file and refuses a link', async () => {
    await fs.writeFile(path.join(root, 'real.md'), 'real')
    await fs.symlink(path.join(root, 'real.md'), path.join(root, 'link.md'))
    expect(await readRegularFile(path.join(root, 'real.md'))).toBe('real')
    expect(await readRegularFile(path.join(root, 'link.md'))).toBeNull()
    expect(await readRegularFile(path.join(root, 'missing.md'))).toBeNull()
  })

  // Opening a FIFO for read-only access
  // blocks forever until a writer connects — one for every hung open() ties
  // up a libuv threadpool thread (default size 4), so a handful of these
  // stalls the whole site. O_NONBLOCK on the open call is the fix; this test
  // fails by hanging (past its timeout) rather than by a wrong assertion if
  // that flag is ever dropped.
  it.skipIf(process.platform === 'win32')('returns null promptly for a FIFO instead of blocking the open forever', async () => {
    const fifoPath = path.join(root, 'fifo')
    try {
      execFileSync('mkfifo', [fifoPath])
    } catch {
      return // mkfifo unavailable on this platform/runner — nothing to exercise
    }
    const TIMED_OUT = Symbol('timed-out')
    const result = await Promise.race([
      readRegularFile(fifoPath),
      new Promise(resolve => setTimeout(() => resolve(TIMED_OUT), 2000)),
    ])
    expect(result).toBeNull()
  }, 3000)

  // A hard link has no link marker to refuse: `O_NOFOLLOW` sees an ordinary
  // regular file, and its path is inside the sandbox. What gives it away is a
  // link count above one — the same inode is reachable from somewhere else,
  // possibly outside the files home.
  it('refuses a sandboxed regular file with another hard link, and reads it once the link is gone', async () => {
    const home = await fs.realpath(root)
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'))
    try {
      await fs.writeFile(path.join(outside, 'secret.md'), 'secret')
      await fs.link(path.join(outside, 'secret.md'), path.join(home, 'linked.md'))
      expect(await readFileNoFollow(path.join(home, 'linked.md'), { sandboxHome: home })).toEqual({ ok: false, reason: 'link' })

      await fs.rm(path.join(outside, 'secret.md'))
      expect(await readFileNoFollow(path.join(home, 'linked.md'), { sandboxHome: home })).toEqual({ ok: true, buf: Buffer.from('secret') })
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })

  it('does not apply the link-count rule to a read with no sandbox', async () => {
    await fs.writeFile(path.join(root, 'a.md'), 'a')
    await fs.link(path.join(root, 'a.md'), path.join(root, 'b.md'))
    expect(await readFileNoFollow(path.join(root, 'b.md'))).toEqual({ ok: true, buf: Buffer.from('a') })
  })

  it('reads no more than the size fstat reported, even when the file has grown since', async () => {
    const file = path.join(root, 'growing.md')
    await fs.writeFile(file, '0123456789')
    const realOpen = fs.open.bind(fs)
    const spy = vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await realOpen(...args)
      const realStat = handle.stat.bind(handle)
      handle.stat = (async () => Object.assign(await realStat(), { size: 4 })) as typeof handle.stat
      return handle
    })
    try {
      const result = await readFileNoFollow(file, { maxBytes: 4 })
      expect(result).toEqual({ ok: true, buf: Buffer.from('0123') })
    } finally {
      spy.mockRestore()
    }
  })

  describe('readBoundaryFile', () => {
    it('reads a file under the override once its directory is confirmed inside the files home', async () => {
      const { dir, filesHome } = boundaryOverridePath(project, 'agent-1')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'instructions.md'), 'In Atlas, cite the ADR.')
      const override = { dir: await fs.realpath(dir), filesHome: await fs.realpath(filesHome) }
      expect(await readBoundaryFile(override, 'instructions.md')).toBe('In Atlas, cite the ADR.')
    })

    it('refuses an instructions file larger than the limit, and reads one at it', async () => {
      const { dir, filesHome } = boundaryOverridePath(project, 'agent-1')
      await fs.mkdir(dir, { recursive: true })
      const override = { dir: await fs.realpath(dir), filesHome: await fs.realpath(filesHome) }
      await fs.writeFile(path.join(dir, 'instructions.md'), 'x'.repeat(BOUNDARY_FILE_MAX_BYTES))
      expect(await readBoundaryFile(override, 'instructions.md')).toHaveLength(BOUNDARY_FILE_MAX_BYTES)
      await fs.writeFile(path.join(dir, 'instructions.md'), 'x'.repeat(BOUNDARY_FILE_MAX_BYTES + 1))
      expect(await readBoundaryFile(override, 'instructions.md')).toBeNull()
    })

    it('refuses an instructions file that is a hard link to a file elsewhere', async () => {
      const { dir, filesHome } = boundaryOverridePath(project, 'agent-1')
      await fs.mkdir(dir, { recursive: true })
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'))
      try {
        await fs.writeFile(path.join(outside, 'secret.md'), 'exfiltrated content')
        await fs.link(path.join(outside, 'secret.md'), path.join(dir, 'instructions.md'))
        const override = { dir: await fs.realpath(dir), filesHome: await fs.realpath(filesHome) }
        expect(await readBoundaryFile(override, 'instructions.md')).toBeNull()
      } finally {
        await fs.rm(outside, { recursive: true, force: true })
      }
    })

    it('refuses a read once the override directory has been swapped for a link out (TOCTOU recheck)', async () => {
      const { dir, filesHome } = boundaryOverridePath(project, 'agent-1')
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, 'instructions.md'), 'stale content')
      const override = { dir: await fs.realpath(dir), filesHome: await fs.realpath(filesHome) }

      // Simulate the gap between launch (where `override` was resolved) and this
      // read: the agent replaces its own override dir with a
      // link to somewhere outside the files home before the read happens.
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'))
      try {
        await fs.writeFile(path.join(outside, 'instructions.md'), 'exfiltrated content')
        await fs.rm(dir, { recursive: true, force: true })
        await fs.symlink(outside, dir)
        expect(await readBoundaryFile(override, 'instructions.md')).toBeNull()
      } finally {
        await fs.rm(outside, { recursive: true, force: true })
      }
    })
  })
})
