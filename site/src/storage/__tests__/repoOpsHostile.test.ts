/**
 * Connecting a repository to a location an agent has written into: hooks, `core.fsmonitor`, filters, `core.*`
 * programs, includes, alternates and URL rewrites planted in the location's `.git` take no effect. Real git against
 * bare repositories on this machine; each trap is first shown to fire under a plain git, so its silence under ours
 * means something.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GitDeadline } from '../gitRunner'
import { initAndPushRepo, linkAndPullRepo, openRepository } from '../repoOps'
import { readGitStatus } from '../gitStatusRead'

const exec = promisify(execFile)
const TOKEN = 'ghs_secrettoken'
const ID = ['-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false']
const PLAIN_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
const HOOKS = ['pre-commit', 'post-commit', 'commit-msg', 'pre-push', 'post-checkout', 'reference-transaction', 'post-index-change', 'post-merge']

let tmp: string
let markers: string
let remote: string
let evil: string
let evilIncluded: string
let dir: string

const git = (...args: string[]) => exec('git', args, { env: PLAIN_ENV })
const deadline = () => new GitDeadline(60_000)
const fired = async () => (await fs.readdir(markers)).sort()
const branchesOf = async (bare: string) =>
  (await git('-C', bare, 'for-each-ref', '--format=%(refname:short)', 'refs/heads')).stdout.split('\n').filter(Boolean)

/** A script that leaves a marker named `name` and exits with `code`; a filter's passes its input through. */
async function trap(name: string, code = 0, filter = false): Promise<string> {
  const script = path.join(tmp, 'traps', name)
  await fs.mkdir(path.dirname(script), { recursive: true })
  await fs.writeFile(script, `#!/bin/sh\ntouch "${markers}/${name}"\n${filter ? 'cat\n' : ''}exit ${code}\n`, { mode: 0o755 })
  return script
}

/** Every setting an agent could write into a location's `.git` to make the site's git run something or go elsewhere. */
async function plant(location: string): Promise<void> {
  const gd = path.join(location, '.git')
  const set = (key: string, value: string) => git('config', '--file', path.join(gd, 'config'), key, value)
  await fs.mkdir(path.join(gd, 'hooks'), { recursive: true })
  for (const hook of HOOKS) await fs.copyFile(await trap(`hook-${hook}`), path.join(gd, 'hooks', hook))
  await set('core.fsmonitor', await trap('fsmonitor', 1))
  await set('filter.evil.clean', await trap('filter-clean', 0, true))
  await set('filter.evil.smudge', await trap('filter-smudge', 0, true))
  await set('filter.evil.required', 'true')
  await fs.mkdir(path.join(gd, 'info'), { recursive: true })
  await fs.writeFile(path.join(gd, 'info', 'attributes'), '* filter=evil\n')
  await set('core.sshCommand', await trap('ssh-command'))
  await set('core.askPass', await trap('askpass'))
  await set('core.pager', await trap('pager'))
  await set('core.editor', await trap('editor'))
  await set('credential.helper', `!${await trap('credential-helper')}`)
  await set('http.proxy', 'http://127.0.0.1:9')
  await set(`url.${evil}.insteadOf`, remote)
  // An include, conditional or not, that would send the push elsewhere.
  const included = path.join(tmp, 'included.config')
  await fs.writeFile(included, `[remote "origin"]\n\tpushurl = ${evilIncluded}\n`)
  await set('include.path', included)
  await set('includeIf.gitdir:/.path', included)
}

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'site-hostile-')))
  markers = path.join(tmp, 'markers')
  await fs.mkdir(markers)
  remote = path.join(tmp, 'remote-bare')
  evil = path.join(tmp, 'evil-bare')
  evilIncluded = path.join(tmp, 'evil-included-bare')
  for (const bare of [remote, evil, evilIncluded]) await git('init', '-q', '--bare', '-b', 'main', bare)
  dir = path.join(tmp, 'location')
  await fs.mkdir(dir)
})

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

/** A location with a commit on main and an uncommitted file, every trap planted in its `.git`. */
async function armedLocation(at: string): Promise<void> {
  await fs.mkdir(at, { recursive: true })
  await git('-C', at, 'init', '-q', '-b', 'main')
  await fs.writeFile(path.join(at, 'README.md'), 'hello\n')
  await git('-C', at, 'add', '-A')
  await git('-C', at, ...ID, 'commit', '-q', '-m', 'first')
  await git('-C', at, 'remote', 'add', 'origin', remote)
  await plant(at)
  await fs.writeFile(path.join(at, 'MORE.md'), 'more\n')
}

describe('repo.connect runs no code and follows no setting an agent wrote into the location', { timeout: 30_000 }, () => {
  it('the planted traps are live: a plain git in the same location runs them and pushes elsewhere', async () => {
    const control = path.join(tmp, 'control')
    await armedLocation(control)
    await git('-C', control, 'add', '-A')
    await git('-C', control, ...ID, 'commit', '-q', '-m', 'more')
    await git('-C', control, 'push', 'origin', 'main').catch(() => undefined)
    expect(await fired()).toEqual(expect.arrayContaining(['filter-clean', 'fsmonitor', 'hook-pre-commit', 'hook-reference-transaction']))
    expect(await branchesOf(evilIncluded)).toEqual(['main'])
    expect(await branchesOf(remote)).toEqual([])
  })

  it('a push runs no hook, monitor, filter or helper, and goes to the address the site was given', async () => {
    await armedLocation(dir)
    await initAndPushRepo(dir, remote, TOKEN, deadline())
    expect(await fired()).toEqual([])
    expect(await branchesOf(remote)).toEqual(['main'])
    expect(await branchesOf(evil)).toEqual([])
    expect(await branchesOf(evilIncluded)).toEqual([])
    const { stdout } = await git('-C', remote, 'ls-tree', '--name-only', 'main')
    expect(stdout.split('\n')).toEqual(expect.arrayContaining(['README.md', 'MORE.md']))
    // The location stays a working repository: its own git sees the commit, on main, with nothing left to add.
    expect((await git('-C', dir, 'branch', '--show-current')).stdout.trim()).toBe('main')
    expect((await git('-C', dir, 'log', '-1', '--format=%s')).stdout.trim()).toBe('Initial commit')
    expect((await git('-C', dir, '-c', 'core.fsmonitor=false', 'status', '--porcelain')).stdout).toBe('')
  })

  it('a URL rewrite in the location does not decide where the push goes', async () => {
    await armedLocation(dir)
    const elsewhere = 'https://github.invalid/acme/store'
    await git('config', '--file', path.join(dir, '.git', 'config'), `url.${evil}.insteadOf`, elsewhere)
    await expect(initAndPushRepo(dir, elsewhere, TOKEN, deadline())).rejects.toThrow()
    expect(await branchesOf(evil)).toEqual([])
    expect(await fired()).toEqual([])
  })

  it('a pull into a location holding only a planted .git runs nothing and checks out the given repository', async () => {
    const seed = path.join(tmp, 'seed')
    await fs.mkdir(seed)
    await fs.writeFile(path.join(seed, 'THEIRS.md'), 'theirs\n')
    await fs.writeFile(path.join(seed, '.gitattributes'), '* filter=evil\n')
    await git('-C', seed, 'init', '-q', '-b', 'main')
    await git('-C', seed, 'add', '-A')
    await git('-C', seed, ...ID, 'commit', '-q', '-m', 'theirs')
    await git('-C', seed, 'push', '-q', remote, 'main')
    await git('-C', seed, 'push', '-q', evil, 'main:decoy')

    await git('-C', dir, 'init', '-q', '-b', 'main')
    await plant(dir)
    await linkAndPullRepo(dir, remote, TOKEN, deadline())
    expect(await fired()).toEqual([])
    expect(await fs.readFile(path.join(dir, 'THEIRS.md'), 'utf8')).toBe('theirs\n')
    expect((await git('-C', dir, 'branch', '--show-current')).stdout.trim()).toBe('main')
    expect((await git('-C', dir, 'config', '--file', path.join(dir, '.git', 'config'), 'remote.origin.url')).stdout.trim()).toBe(remote)
  })

  it('git sees only the settings the site supplies, never the location\'s own', async () => {
    await armedLocation(dir)
    const repo = await openRepository(dir, remote, deadline())
    try {
      const { stdout } = await repo.git(['config', '--list', '--show-origin'])
      for (const planted of [path.join(tmp, 'traps'), evil, 'filter.evil', 'http.proxy', 'insteadof', 'pushurl', 'include']) {
        expect(stdout.toLowerCase()).not.toContain(planted.toLowerCase())
      }
      expect(stdout).not.toContain(path.join(dir, '.git', 'config'))
      expect(stdout).toContain(`remote.origin.url=${remote}`)
    } finally {
      await repo.close()
    }
  })

  it('a location whose objects borrow from elsewhere is refused, and nothing is pushed', async () => {
    const other = path.join(tmp, 'other')
    await git('init', '-q', '-b', 'main', other)
    await armedLocation(dir)
    await fs.writeFile(path.join(dir, '.git', 'objects', 'info', 'alternates'), path.join(other, '.git', 'objects') + '\n')
    await expect(initAndPushRepo(dir, remote, TOKEN, deadline())).rejects.toThrow(/borrows|alternates|not a repository/i)
    expect(await branchesOf(remote)).toEqual([])
  })
})

describe('git.status does not follow objects/info/alternates out of the folder', () => {
  it('answers as not a repository', async () => {
    const other = path.join(tmp, 'other')
    await git('init', '-q', '-b', 'main', other)
    await git('-C', dir, 'init', '-q', '-b', 'main')
    await fs.writeFile(path.join(dir, 'a.md'), 'a')
    await git('-C', dir, 'add', '-A')
    await git('-C', dir, ...ID, 'commit', '-q', '-m', 'a')
    expect(await readGitStatus(dir, deadline())).toMatchObject({ repository: true })
    await fs.writeFile(path.join(dir, '.git', 'objects', 'info', 'alternates'), path.join(other, '.git', 'objects') + '\n')
    expect(await readGitStatus(dir, deadline())).toEqual({ repository: false })
  })
})
