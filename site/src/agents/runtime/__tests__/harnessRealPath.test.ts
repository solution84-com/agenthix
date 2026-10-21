import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const h = vi.hoisted(() => ({ dockerWithin: vi.fn() }))
vi.mock('../containerLifecycle', () => ({ dockerWithin: h.dockerWithin }))

import { REAL_PATH_SCRIPT, containerRealPathArgs, containerRealPathResolver, hostRealPathResolver } from '../harnessRealPath'

describe('containerRealPathResolver', () => {
  it('runs as the image user, with the path as an argument and never inside the script', () => {
    const args = containerRealPathArgs('agent-c1', '/projects/p1/$(rm -rf ~)')
    expect(args).toEqual(['exec', '-u', 'appuser', 'agent-c1', 'sh', '-c', REAL_PATH_SCRIPT, 'agenthix-realpath', '/projects/p1/$(rm -rf ~)'])
    expect(REAL_PATH_SCRIPT).not.toContain('projects')
  })

  it('returns the container answer, with a deadline', async () => {
    h.dockerWithin.mockResolvedValueOnce({ stdout: '/home/appuser/.claude.json\n', stderr: '' })
    await expect(containerRealPathResolver('c1', 1234)('/projects/p1/link')).resolves.toBe('/home/appuser/.claude.json')
    expect(h.dockerWithin).toHaveBeenCalledWith(expect.arrayContaining(['c1', '/projects/p1/link']), 1234)
  })

  it('reads an empty answer as the root, and refuses a relative path or answer', async () => {
    h.dockerWithin.mockResolvedValueOnce({ stdout: '\n', stderr: '' })
    await expect(containerRealPathResolver('c1')('/')).resolves.toBe('/')
    await expect(containerRealPathResolver('c1')('rel')).rejects.toThrow(/not absolute/)
    h.dockerWithin.mockResolvedValueOnce({ stdout: 'weird\n', stderr: '' })
    await expect(containerRealPathResolver('c1')('/x')).rejects.toThrow(/not absolute/)
  })

  it('fails when the exec fails', async () => {
    h.dockerWithin.mockRejectedValueOnce(new Error('docker exec timed out'))
    await expect(containerRealPathResolver('c1')('/x')).rejects.toThrow(/timed out/)
  })
})

describe('real path resolution on a real disk', () => {
  let root: string
  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'realpath-')))
    fs.mkdirSync(path.join(root, 'home/.claude'), { recursive: true })
    fs.mkdirSync(path.join(root, 'project'))
    fs.writeFileSync(path.join(root, 'home/.claude.json'), '{}')
    fs.symlinkSync(path.join(root, 'home/.claude.json'), path.join(root, 'project/innocent.txt'))
    fs.symlinkSync(path.join(root, 'home'), path.join(root, 'project/dir'))
    fs.symlinkSync(path.join(root, 'home/not-yet'), path.join(root, 'project/dangling'))
  })
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  const cases = () => [
    ['project/innocent.txt', 'home/.claude.json'],
    ['project/dir/.claude/new/file.txt', 'home/.claude/new/file.txt'],
    ['project/dangling', 'home/not-yet'],
    ['project/../project/new.txt', 'project/new.txt'],
  ].map(([given, real]) => [path.join(root, given), path.join(root, real)])

  it('follows links, dangling ones included, and appends a missing tail (this machine)', async () => {
    for (const [given, real] of cases()) await expect(hostRealPathResolver(given)).resolves.toBe(real)
  })

  it('does the same through the container script, run here by /bin/sh', () => {
    for (const [given, real] of cases()) {
      const out = execFileSync('/bin/sh', ['-c', REAL_PATH_SCRIPT, 'agenthix-realpath', given], { encoding: 'utf8' })
      expect(out.trim()).toBe(real)
    }
  })
})
