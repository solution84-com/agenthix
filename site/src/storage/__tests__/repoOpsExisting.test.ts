/**
 * Connecting an EXISTING repository (workflows spec, *Connecting a repository*): into an empty location it is checked
 * out; into one with files it is pushed only if the repository is empty or shares their history, and refused
 * otherwise. Real git against bare repositories on this machine.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { RepoWorkError, type LocationRef } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))

import { repoConnect, repoState } from '../../server/storage/repoWorkMethods'
import { locationDir } from '../../server/storage/paths'

const git = promisify(execFile)
const TOKEN = 'ghs_secrettoken'
const withFiles: LocationRef = { ownerType: 'project', ownerId: 'proj-0001' }
const empty: LocationRef = { ownerType: 'user', ownerId: 'user-0001' }
const ID = ['-c', 'user.name=T', '-c', 'user.email=t@example.com']

let tmp: string
let remote: string
const saved = { siteRoot: process.env.SITE_ROOT, g: process.env.GIT_CONFIG_GLOBAL, s: process.env.GIT_CONFIG_SYSTEM }

/** Puts one commit on `branch` of the bare remote, from a scratch clone made in `seed`. */
async function seedRemote(branch: string, file: string): Promise<void> {
  const seed = path.join(tmp, `seed-${branch}-${file}`)
  await fs.mkdir(seed)
  await fs.writeFile(path.join(seed, file), file)
  await git('git', ['-C', seed, 'init', '-q', '-b', branch])
  await git('git', ['-C', seed, 'add', '-A'])
  await git('git', ['-C', seed, ...ID, 'commit', '-m', file])
  await git('git', ['-C', seed, 'push', remote, branch])
}

const remoteBranches = async () => (await git('git', ['-C', remote, 'branch', '--format=%(refname:short)'])).stdout.trim().split('\n').filter(Boolean)

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'site-existing-'))
  process.env.SITE_ROOT = path.join(tmp, 'site-root')
  process.env.GIT_CONFIG_GLOBAL = '/dev/null'
  process.env.GIT_CONFIG_SYSTEM = '/dev/null'
  await fs.mkdir(locationDir(withFiles), { recursive: true })
  remote = path.join(tmp, 'remote-bare')
  await git('git', ['init', '--bare', '-b', 'main', remote])
})

afterEach(async () => {
  for (const [k, v] of [['SITE_ROOT', saved.siteRoot], ['GIT_CONFIG_GLOBAL', saved.g], ['GIT_CONFIG_SYSTEM', saved.s]] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('an existing repository, connected to a location @SC-1358', () => {
  it('is checked out into an empty location', async () => {
    await seedRemote('main', 'THEIRS.md')
    await repoConnect({ loc: empty, direction: 'pull', repoUrl: remote, token: TOKEN })
    expect(await fs.readFile(path.join(locationDir(empty), 'THEIRS.md'), 'utf8')).toBe('THEIRS.md')
  })

  it('an empty repository connects to an empty location, which then waits for its first push', async () => {
    expect(await repoConnect({ loc: empty, direction: 'pull', repoUrl: remote, token: TOKEN })).toEqual({ connected: true })
    expect(await repoState({ loc: empty })).toEqual({ isGitRepo: true, hasFiles: false })
  })

  it('takes a location\'s files when the repository is empty', async () => {
    await fs.writeFile(path.join(locationDir(withFiles), 'OURS.md'), 'ours')
    await repoConnect({ loc: withFiles, direction: 'push', repoUrl: remote, token: TOKEN })
    expect(await remoteBranches()).toEqual(['main'])
  })

  it('takes a location\'s new work when the repository shares its history', async () => {
    await seedRemote('main', 'THEIRS.md')
    await repoConnect({ loc: empty, direction: 'pull', repoUrl: remote, token: TOKEN })
    const dir = locationDir(empty)
    await fs.writeFile(path.join(dir, 'MORE.md'), 'more')
    await expect(repoConnect({ loc: empty, direction: 'push', repoUrl: remote, token: TOKEN })).resolves.toEqual({ connected: true })
    const { stdout } = await git('git', ['-C', remote, 'ls-tree', '--name-only', 'main'])
    expect(stdout.split('\n')).toEqual(expect.arrayContaining(['THEIRS.md', 'MORE.md']))
  })

  it('never moves a location\'s own branches: work on another branch stays there, and only main is pushed', async () => {
    await seedRemote('main', 'THEIRS.md')
    await repoConnect({ loc: empty, direction: 'pull', repoUrl: remote, token: TOKEN })
    const dir = locationDir(empty)
    const mainBefore = (await git('git', ['-C', remote, 'rev-parse', 'main'])).stdout.trim()
    await git('git', ['-C', dir, 'checkout', '-q', '-b', 'demo-1'])
    await fs.writeFile(path.join(dir, 'AGENT.md'), 'agent')
    await git('git', ['-C', dir, 'add', '-A'])
    await git('git', ['-C', dir, ...ID, 'commit', '-q', '-m', 'agent work'])
    await fs.writeFile(path.join(dir, 'HALF.md'), 'half done')
    await expect(repoConnect({ loc: empty, direction: 'push', repoUrl: remote, token: TOKEN })).resolves.toEqual({ connected: true })
    expect((await git('git', ['-C', remote, 'rev-parse', 'main'])).stdout.trim()).toBe(mainBefore)
    expect(await remoteBranches()).toEqual(['main'])
    expect((await git('git', ['-C', dir, 'branch', '--show-current'])).stdout.trim()).toBe('demo-1')
    expect((await git('git', ['-C', dir, 'log', '-1', '--format=%s'])).stdout.trim()).toBe('agent work')
    expect((await git('git', ['-C', dir, 'status', '--porcelain'])).stdout).toContain('HALF.md')
  })

  it('refuses plainly when the repository has history the files do not share, even on another branch, and pushes nothing', async () => {
    await seedRemote('master', 'THEIRS.md')
    await fs.writeFile(path.join(locationDir(withFiles), 'OURS.md'), 'ours')
    const err = await repoConnect({ loc: withFiles, direction: 'push', repoUrl: remote, token: TOKEN }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RepoWorkError)
    expect((err as RepoWorkError).code).toBe('push_rejected')
    expect((err as RepoWorkError).detail).toMatch(/do not share/)
    expect(await remoteBranches()).toEqual(['master'])
  })
})
