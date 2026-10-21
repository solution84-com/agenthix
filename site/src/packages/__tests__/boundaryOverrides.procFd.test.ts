import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// Every read here runs as if on Linux, where /proc/self/fd exists. The
// descriptor lookup itself (`fs.readlink`) is stubbed per test rather than left
// to the host: a real Linux host resolves it successfully, a macOS one fails
// it, and these tests must mean the same thing on both.
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  const platform = () => 'linux' as NodeJS.Platform
  return { ...actual, platform, default: { ...actual, platform } }
})

import { readFileNoFollow, realpathOfFd } from '../boundaryOverrides'
import { stageSkills, skillRootsFor } from '../../agents/runtime/skillStaging'

let dir: string
let readlink: MockInstance<typeof fs.readlink>
beforeEach(async () => {
  dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'procfd-')))
  readlink = vi.spyOn(fs, 'readlink')
})
afterEach(async () => {
  readlink.mockRestore()
  await fs.rm(dir, { recursive: true, force: true })
})

const failReadlink = () => readlink.mockRejectedValue(Object.assign(new Error('ENOENT: no such file or directory, readlink'), { code: 'ENOENT' }))

describe('a resolved /proc/self/fd readlink on Linux', () => {
  it('reads a file whose descriptor resolves inside the sandbox', async () => {
    await fs.writeFile(path.join(dir, 'a.md'), 'a')
    readlink.mockResolvedValue(path.join(dir, 'a.md'))
    expect(await readFileNoFollow(path.join(dir, 'a.md'), { sandboxHome: dir })).toEqual({ ok: true, buf: Buffer.from('a') })
    expect(readlink).toHaveBeenCalledWith(expect.stringMatching(/^\/proc\/self\/fd\/\d+$/))
  })

  it('refuses a file whose descriptor resolves outside the sandbox', async () => {
    await fs.writeFile(path.join(dir, 'a.md'), 'a')
    readlink.mockResolvedValue('/etc/passwd')
    expect(await readFileNoFollow(path.join(dir, 'a.md'), { sandboxHome: dir })).toEqual({ ok: false, reason: 'outside-sandbox' })
  })
})

describe('a failed /proc/self/fd readlink on Linux', () => {
  beforeEach(() => { failReadlink() })

  it('rejects rather than reporting the check as unavailable', async () => {
    const handle = await fs.open(path.join(dir, 'x'), 'w')
    try {
      await expect(realpathOfFd(handle.fd)).rejects.toThrow()
    } finally {
      await handle.close()
    }
  })

  it('refuses a sandboxed file read instead of skipping the check', async () => {
    await fs.writeFile(path.join(dir, 'a.md'), 'a')
    expect(await readFileNoFollow(path.join(dir, 'a.md'), { sandboxHome: dir })).toEqual({ ok: false, reason: 'outside-sandbox' })
    expect(await readFileNoFollow(path.join(dir, 'a.md'))).toEqual({ ok: true, buf: Buffer.from('a') })
  })

  it('stages no boundary skill whose directories cannot be confirmed', async () => {
    const override = path.join(dir, 'home', '.agents', 'agents', 'a1')
    await fs.mkdir(path.join(override, 'skills', 'ok'), { recursive: true })
    await fs.writeFile(path.join(override, 'skills', 'ok', 'SKILL.md'), '---\nname: Ok\n---\n')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const roots = skillRootsFor({ platformDir: path.join(dir, 'p'), orgDir: null, agentDir: path.join(dir, 'a') }, { dir: override, filesHome: path.join(dir, 'home') })
      expect(await stageSkills(roots, path.join(dir, 'out'))).toEqual([])
    } finally {
      warnSpy.mockRestore()
    }
  })
})
