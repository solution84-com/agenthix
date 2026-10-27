/**
 * `git.status`'s read (spec part 4; part 6, T12 and V10), against real repositories in temporary folders: each state
 * of the line, a repository's own hooks, `core.fsmonitor` and clean filters not running (each trap first shown to
 * fire under a plain `git status`, so the test proves something), and a read that neither writes the index nor stops
 * at an agent's `index.lock`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GitDeadline } from '../gitRunner'
import { countPorcelain, readGitStatus } from '../gitStatusRead'

const exec = promisify(execFile)
const IDENTITY = ['-c', 'user.name=Kernel', '-c', 'user.email=kernel@example.test', '-c', 'commit.gpgsign=false']

let tmp: string
let repo: string

async function git(...args: string[]) {
  return exec('git', ['-C', repo, ...IDENTITY, ...args], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } })
}
const write = (name: string, text: string) => fs.mkdir(path.dirname(path.join(repo, name)), { recursive: true })
  .then(() => fs.writeFile(path.join(repo, name), text))
const read = () => readGitStatus(repo, new GitDeadline(10_000))
const exists = (p: string) => fs.access(p).then(() => true, () => false)

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'git-status-')))
  repo = path.join(tmp, 'repo')
  await fs.mkdir(repo)
})

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

async function committed() {
  await git('init', '-q', '-b', 'main')
  await write('README.md', 'hello\n')
  await write('src/a.txt', 'a\n')
  await git('add', '-A')
  await git('commit', '-qm', 'Add Q3 chart page')
}

describe('git.status: the states @SC-1505', () => {
  it('a folder with no .git is not a repository', async () => {
    await write('notes.md', 'x')
    expect(await read()).toEqual({ repository: false })
  })

  it('a .git that is a link, or a file pointing elsewhere, is not read', async () => {
    const other = path.join(tmp, 'other')
    await fs.mkdir(other)
    await exec('git', ['-C', other, 'init', '-q'])
    await fs.symlink(path.join(other, '.git'), path.join(repo, '.git'))
    expect(await read()).toEqual({ repository: false })
    await fs.rm(path.join(repo, '.git'))
    await fs.writeFile(path.join(repo, '.git'), `gitdir: ${path.join(other, '.git')}\n`)
    expect(await read()).toEqual({ repository: false })
  })

  it('no commits yet: the branch, every file counted as new, no last commit', async () => {
    await git('init', '-q', '-b', 'main')
    await write('a.md', 'a')
    await write('b.md', 'b')
    await write('docs/c.md', 'c')
    await git('add', 'a.md')
    expect(await read()).toEqual({
      repository: true, head: { kind: 'branch', name: 'main' }, changed: 3, changedOverflow: false, lastCommit: null, inProgress: null,
    })
  })

  it('clean: no changes, and the last commit with its short id, first line, author and time', async () => {
    await committed()
    const status = await read()
    const { stdout: id } = await git('rev-parse', '--short', 'HEAD')
    expect(status).toMatchObject({ repository: true, head: { kind: 'branch', name: 'main' }, changed: 0, inProgress: null })
    if (!status.repository) throw new Error('unreachable')
    expect(status.lastCommit).toMatchObject({ id: id.trim(), subject: 'Add Q3 chart page', author: 'Kernel' })
    expect(Date.parse(status.lastCommit!.at)).not.toBeNaN()
  })

  it('changed: modified, deleted, staged, renamed and new files each count once', async () => {
    await committed()
    await git('checkout', '-q', '-b', 'feature/q3-charts')
    await write('README.md', 'changed\n')
    await git('mv', 'src/a.txt', 'src/renamed.txt')
    await write('new.md', 'n')
    await write('staged.md', 's')
    await git('add', 'staged.md')
    expect(await read()).toMatchObject({ head: { kind: 'branch', name: 'feature/q3-charts' }, changed: 4 })
    await fs.rm(path.join(repo, 'README.md'))
    expect(await read()).toMatchObject({ changed: 4 })
  })

  it('detached: at the commit checked out', async () => {
    await committed()
    await git('checkout', '-q', '--detach')
    const { stdout: id } = await git('rev-parse', '--short', 'HEAD')
    expect(await read()).toMatchObject({ head: { kind: 'detached', commit: id.trim() }, changed: 0 })
  })

  it('a merge stopped halfway', async () => {
    await committed()
    await git('checkout', '-q', '-b', 'other')
    await write('README.md', 'theirs\n')
    await git('commit', '-qam', 'Theirs')
    await git('checkout', '-q', 'main')
    await write('README.md', 'ours\n')
    await git('commit', '-qam', 'Ours')
    await git('merge', 'other').catch(() => undefined)
    expect(await read()).toMatchObject({ inProgress: 'merge', head: { kind: 'branch', name: 'main' } })
  })

  it('a rebase stopped halfway', async () => {
    await committed()
    await git('checkout', '-q', '-b', 'other')
    await write('README.md', 'theirs\n')
    await git('commit', '-qam', 'Theirs')
    await git('checkout', '-q', 'main')
    await write('README.md', 'ours\n')
    await git('commit', '-qam', 'Ours')
    await git('rebase', 'other').catch(() => undefined)
    expect(await read()).toMatchObject({ inProgress: 'rebase' })
  })
})

describe('git.status: nothing in the repository runs (T12) @SC-1506 @SC-1573', () => {
  async function armed(marker: string) {
    // The trap fires under an ordinary status, so its silence under ours means something.
    await exec('git', ['-C', repo, 'status', '--porcelain'], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } }).catch(() => undefined)
    expect(await exists(marker)).toBe(true)
    await fs.rm(marker)
  }

  it('a clean filter the attributes name does not run', async () => {
    await committed()
    const marker = path.join(tmp, 'filter-ran')
    await git('config', 'filter.evil.clean', `touch ${marker}; cat`)
    await write('.gitattributes', '* filter=evil\n')
    const touch = () => fs.utimes(path.join(repo, 'README.md'), new Date(2020, 0, 1), new Date(2020, 0, 1))
    await touch()
    await armed(marker)
    await touch()
    await read()
    expect(await exists(marker)).toBe(false)
  })

  it('core.fsmonitor and hooks set in the repository do not run', async () => {
    await committed()
    const marker = path.join(tmp, 'monitor-ran')
    const script = path.join(tmp, 'monitor.sh')
    await fs.writeFile(script, `#!/bin/sh\ntouch ${marker}\nexit 1\n`, { mode: 0o755 })
    await git('config', 'core.fsmonitor', script)
    await armed(marker)
    const hooks = path.join(tmp, 'hooks')
    await fs.mkdir(hooks)
    for (const hook of ['post-index-change', 'post-checkout', 'pre-commit']) {
      await fs.writeFile(path.join(hooks, hook), `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 })
    }
    await git('config', 'core.hooksPath', hooks)
    await read()
    expect(await exists(marker)).toBe(false)
  })
})

describe('git.status never blocks an agent (GIT_OPTIONAL_LOCKS) @SC-1507', () => {
  it('leaves an index that needs refreshing as it was, taking no lock', async () => {
    await committed()
    await fs.utimes(path.join(repo, 'README.md'), new Date(2020, 0, 1), new Date(2020, 0, 1))
    const index = path.join(repo, '.git', 'index')
    const before = await fs.readFile(index)
    await read()
    expect((await fs.readFile(index)).equals(before)).toBe(true)
  })

  it('reads while an agent holds index.lock, and leaves the lock and the commit to it', async () => {
    await committed()
    const lock = path.join(repo, '.git', 'index.lock')
    await fs.writeFile(lock, '')
    await write('README.md', 'changed\n')
    expect(await read()).toMatchObject({ repository: true, changed: 1 })
    expect(await exists(lock)).toBe(true)
    await fs.rm(lock)
    await git('commit', '-qam', 'The agent commits')
    expect(await read()).toMatchObject({ changed: 0, lastCommit: { subject: 'The agent commits' } })
  })
})

describe('countPorcelain @SC-1505', () => {
  it('counts a rename once, and a cut-off listing as a floor', () => {
    expect(countPorcelain(' M a\0R  new\0old\0?? n\0', false)).toEqual({ changed: 3, overflow: false })
    expect(countPorcelain(' M a\0?? n\0?? cut-off\n… 9 further characters not retained', true)).toEqual({ changed: 2, overflow: true })
  })
})
