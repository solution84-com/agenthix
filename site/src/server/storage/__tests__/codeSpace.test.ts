/**
 * adr-0173 on repository work: a repository workspace's `main` lives in the code space, a folder no container can
 * write, and every git command the site runs itself runs there; `files/` backed up to GitHub stays in the boundary,
 * its first push made from a copy of the site's own and only the finished `.git` put back. Nothing on the way follows
 * a symbolic link a run put in the boundary. Real git, against a bare repository on this machine.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { RepoWorkError } from '@agenthix/core'

vi.mock('../../utils/logger', () => ({
  Logger: vi.fn().mockImplementation(function () { return ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() }) }),
}))

import { repoConnect, repoState } from '../repoWorkMethods'
import { gitStatus } from '../gitStatusMethod'
import { becomeRepository, isCodeWorkspace, untilSwitched } from '../codeSpace'
import { copyOutOfBoundary, CopyRefused } from '../boundaryTreeCopy'
import { getCodeDir, ownerDir } from '../paths'

const run = promisify(execFile)
const git = async (cwd: string, ...args: string[]) => (await run('git', ['-C', cwd, ...args])).stdout.trim()

let tmp: string
let root: string
let remote: string
const saved = { root: process.env.SITE_ROOT, global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_SYSTEM }
const ws = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' }
const boundary = () => ownerDir('project', 'p1')
const wsFolder = () => path.join(boundary(), 'workspaces', 'w1')
const filesFolder = () => path.join(boundary(), 'files')
const exists = (p: string) => fs.lstat(p).then(() => true, () => false)

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'code-space-')))
  root = path.join(tmp, 'site')
  process.env.SITE_ROOT = root
  process.env.GIT_CONFIG_GLOBAL = '/dev/null'
  process.env.GIT_CONFIG_SYSTEM = '/dev/null'
  remote = path.join(tmp, 'remote-bare')
  await run('git', ['init', '--bare', '-q', '-b', 'main', remote])
})

afterEach(async () => {
  for (const [k, v] of [['SITE_ROOT', saved.root], ['GIT_CONFIG_GLOBAL', saved.global], ['GIT_CONFIG_SYSTEM', saved.system]] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('a workspace connected to GitHub becomes a repository in the code space', () => {
  it("pushes from main in the code space, and removes the workspace's old folder in the boundary", async () => {
    await fs.mkdir(wsFolder(), { recursive: true })
    await fs.writeFile(path.join(wsFolder(), 'app.js'), 'console.log(1)\n')

    expect(await repoConnect({ loc: ws, direction: 'push', repoUrl: remote, token: 't' })).toEqual({ connected: true })

    expect(await isCodeWorkspace(ws)).toBe(true)
    expect(await fs.readFile(path.join(getCodeDir(ws), 'app.js'), 'utf8')).toBe('console.log(1)\n')
    expect(await git(remote, 'show', 'main:app.js')).toBe('console.log(1)')
    expect(await exists(wsFolder())).toBe(false)
    expect(await repoState({ loc: ws })).toEqual({ isGitRepo: true, hasFiles: true })
    expect(await gitStatus({ loc: ws })).toMatchObject({ repository: true, head: { kind: 'branch', name: 'main' }, changed: 0 })
  })

  it('pulls an existing repository straight into the code space', async () => {
    const seed = path.join(tmp, 'seed')
    await run('git', ['init', '-q', '-b', 'main', seed])
    await fs.writeFile(path.join(seed, 'README.md'), 'from GitHub\n')
    await git(seed, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'add', '-A')
    await git(seed, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-qm', 'first')
    await git(seed, 'push', '-q', remote, 'main')

    await repoConnect({ loc: ws, direction: 'pull', repoUrl: remote, token: 't' })

    expect(await fs.readFile(path.join(getCodeDir(ws), 'README.md'), 'utf8')).toBe('from GitHub\n')
    expect(await exists(wsFolder())).toBe(false)
  })

  it("a run's own `.git` in the boundary does not make the workspace a repository", async () => {
    await fs.mkdir(path.join(wsFolder(), '.git'), { recursive: true })
    expect(await isCodeWorkspace(ws)).toBe(false)
    expect((await repoState({ loc: ws })).isGitRepo).toBe(false)
  })

  it('refuses, and changes nothing, when the workspaces folder is a link a run put there', async () => {
    const elsewhere = path.join(root, 'projects', 'p2', 'workspaces')
    await fs.mkdir(path.join(elsewhere, 'w1'), { recursive: true })
    await fs.writeFile(path.join(elsewhere, 'w1', 'secret.txt'), 'p2 only\n')
    await fs.mkdir(boundary(), { recursive: true })
    await fs.symlink(elsewhere, path.join(boundary(), 'workspaces'))

    const err = await repoConnect({ loc: ws, direction: 'push', repoUrl: remote, token: 't' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RepoWorkError)
    expect((err as RepoWorkError).code).toBe('refused')
    expect(await isCodeWorkspace(ws)).toBe(false)
    expect(await git(remote, 'rev-parse', '--verify', '-q', 'main').catch(() => '')).toBe('')
    expect(await fs.readFile(path.join(elsewhere, 'w1', 'secret.txt'), 'utf8')).toBe('p2 only\n')
  })
})

describe('files/ backed up to GitHub, the one exception', () => {
  it('pushes from a copy of the site\'s own, then puts the finished .git into files/', async () => {
    await fs.mkdir(filesFolder(), { recursive: true })
    await fs.writeFile(path.join(filesFolder(), 'notes.md'), 'notes\n')
    const loc = { ownerType: 'project' as const, ownerId: 'p1' }

    await repoConnect({ loc, direction: 'push', repoUrl: remote, token: 't' })

    expect(await git(remote, 'show', 'main:notes.md')).toBe('notes')
    expect((await fs.lstat(path.join(filesFolder(), '.git'))).isDirectory()).toBe(true)
    expect(await git(filesFolder(), 'rev-parse', 'HEAD')).toBe(await git(remote, 'rev-parse', 'main'))
    expect(await fs.readdir(filesFolder())).toEqual(expect.arrayContaining(['.git', 'notes.md']))
    // Nothing of the site's own copy is left behind.
    expect(await fs.readdir(path.join(root, 'code', '.work'))).toEqual([])
  })

  it('refuses a .git holding a symbolic link, which git on this machine would follow, and pushes nothing', async () => {
    const other = path.join(root, 'projects', 'p2', 'files', '.git', 'objects')
    await fs.mkdir(other, { recursive: true })
    await fs.mkdir(path.join(filesFolder(), '.git'), { recursive: true })
    await fs.symlink(other, path.join(filesFolder(), '.git', 'objects'))
    const loc = { ownerType: 'project' as const, ownerId: 'p1' }

    const err = await repoConnect({ loc, direction: 'push', repoUrl: remote, token: 't' }).catch((e: unknown) => e)
    expect((err as RepoWorkError).code).toBe('refused')
    expect(await git(remote, 'rev-parse', '--verify', '-q', 'main').catch(() => '')).toBe('')
  })
})

describe('copying out of a boundary', () => {
  it('copies a symbolic link as a symbolic link, never what it leads to', async () => {
    const secret = path.join(root, 'homes', 'users', 'u2', 'p1', '.claude', '.credentials.json')
    await fs.mkdir(path.dirname(secret), { recursive: true })
    await fs.writeFile(secret, 'sign-in')
    await fs.mkdir(wsFolder(), { recursive: true })
    await fs.symlink(secret, path.join(wsFolder(), 'creds'))
    const dest = path.join(tmp, 'out')

    await copyOutOfBoundary(boundary(), 'workspaces/w1', dest)

    expect((await fs.lstat(path.join(dest, 'creds'))).isSymbolicLink()).toBe(true)
    expect(await fs.readlink(path.join(dest, 'creds'))).toBe(secret)
  })

  it('refuses a folder on the way that is a symbolic link', async () => {
    await fs.mkdir(path.join(root, 'users', 'u2', 'files'), { recursive: true })
    await fs.mkdir(boundary(), { recursive: true })
    await fs.symlink(path.join(root, 'users', 'u2'), path.join(boundary(), 'workspaces'))
    await expect(copyOutOfBoundary(boundary(), 'workspaces/files', path.join(tmp, 'out'))).rejects.toBeInstanceOf(CopyRefused)
  })
})

describe('the switch-over', () => {
  it('holds new runs in the workspace until main is in place', async () => {
    await fs.mkdir(wsFolder(), { recursive: true })
    let release!: () => void
    const building = becomeRepository(ws, 'files', async dir => {
      await new Promise<void>(r => { release = r })
      await run('git', ['init', '-q', dir])
    })
    let held = true
    const waiting = untilSwitched('w1').then(() => { held = false })
    await new Promise(r => setTimeout(r, 20))
    expect(held).toBe(true)
    release()
    await building
    await waiting
    expect(held).toBe(false)
    expect(await isCodeWorkspace(ws)).toBe(true)
  })
})
