/**
 * What an agent writes into a copy, or wrote into a workspace's repository before it was read-only, never runs on the
 * site, never leads the helper outside the copy, and never moves `main`.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, AUTHOR, COPY_A, at, gitOn, makeOwner, op, sh, write, type Owner } from './gitFixture'

let owner: Owner
let outside: string
beforeEach(() => {
  owner = makeOwner()
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-outside-'))
})
afterEach(() => {
  fs.rmSync(owner.root, { recursive: true, force: true })
  fs.rmSync(outside, { recursive: true, force: true })
})

const marker = () => path.join(outside, 'ran')
const ran = () => fs.existsSync(marker())
const script = () => `#!/bin/sh\ntouch '${marker()}'\n`

async function withCopy(): Promise<string> {
  await gitOn(owner)
  await op(owner, { op: 'create', branch: 'login-page', originUrl: '/p/workspaces/w1' }, { id: COPY_A, readOnly: false })
  return owner.copyDir(COPY_A)
}
const commit = () => op(owner, { op: 'commit', branch: 'login-page', message: 'x', author: AGENT, at: at() }, { id: COPY_A, readOnly: false }, true)
const bringBack = () => op(owner, { op: 'bringBack', branch: 'login-page', date: '2026-11-01' }, { id: COPY_A, readOnly: true })

/** Every way a repository's own files can name a program Git runs. */
function plant(gitDir: string): void {
  const hook = script()
  fs.mkdirSync(path.join(gitDir, 'hooks'), { recursive: true })
  for (const h of ['pre-commit', 'post-commit', 'reference-transaction', 'post-checkout', 'pre-push', 'post-merge', 'post-index-change']) {
    fs.writeFileSync(path.join(gitDir, 'hooks', h), hook, { mode: 0o755 })
  }
  const elsewhere = path.join(outside, 'hooks')
  fs.mkdirSync(elsewhere, { recursive: true })
  fs.writeFileSync(path.join(elsewhere, 'reference-transaction'), hook, { mode: 0o755 })
  fs.writeFileSync(path.join(outside, 'run.sh'), hook, { mode: 0o755 })
  fs.writeFileSync(path.join(outside, 'included'), `[core]\n\tfsmonitor = ${path.join(outside, 'run.sh')}\n`)
  fs.appendFileSync(path.join(gitDir, 'config'), [
    '[core]', `\thooksPath = ${elsewhere}`, `\tfsmonitor = ${path.join(outside, 'run.sh')}`,
    '[include]', `\tpath = ${path.join(outside, 'included')}`,
    '[filter "evil"]', `\tclean = ${path.join(outside, 'run.sh')}`, `\tsmudge = ${path.join(outside, 'run.sh')}`, '\trequired = true',
    '[merge "evil"]', `\tdriver = ${path.join(outside, 'run.sh')}`,
    '[diff "evil"]', `\ttextconv = ${path.join(outside, 'run.sh')}`,
    '[commit]', '\tgpgSign = true', '[gpg]', `\tprogram = ${path.join(outside, 'run.sh')}`,
    '[url "file:///nowhere/"]', '\tinsteadOf = /',
    '',
  ].join('\n'))
  fs.mkdirSync(path.join(gitDir, 'info'), { recursive: true })
  fs.writeFileSync(path.join(gitDir, 'info', 'attributes'), '* filter=evil merge=evil diff=evil\n')
}

describe('settings, hooks and filters planted in a copy', () => {
  it('do run for an ordinary git, so the tests below would see them run', async () => {
    const copy = await withCopy()
    plant(path.join(copy, '.git'))
    write(copy, '.gitattributes', '* filter=evil\n')
    write(copy, 'page.html', '<p></p>\n')
    execFileSync('git', ['add', '-A'], { cwd: copy, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } })
    expect(ran()).toBe(true)
  })

  it('none runs when the site commits in the copy and brings the branch back', async () => {
    const copy = await withCopy()
    plant(path.join(copy, '.git'))
    write(copy, '.gitattributes', '* filter=evil merge=evil diff=evil\n')
    write(copy, 'page.html', '<p></p>\n')
    expect(await commit()).toMatchObject({ files: 2 })
    expect(await bringBack()).toMatchObject({ moved: true })
    expect(ran()).toBe(false)
  })
})

describe('settings, hooks and filters planted in the workspace repository', () => {
  it('none runs for a merge, a restore, the reads or a new copy', async () => {
    const copy = await withCopy()
    write(copy, '.gitattributes', '* filter=evil merge=evil diff=evil\n')
    write(copy, 'README.md', 'changed\n')
    await commit(); await bringBack()
    const main = sh(owner.ws, ['rev-parse', 'main'])
    plant(path.join(owner.ws, '.git'))
    const m = await op(owner, { op: 'merge', branch: 'login-page', base: null, expectedMain: main, message: 'M', author: AUTHOR, at: at() })
    expect(m).toMatchObject({ version: { number: 2 } })
    await op(owner, { op: 'restore', version: main, expectedMain: (m.version as { commit: string }).commit, message: 'R', author: AUTHOR, at: at() })
    for (const q of [{ op: 'list', merged: [], max: 10 }, { op: 'changes', branch: 'login-page', base: null, max: 10 }, { op: 'versions', limit: 10, before: null }]) {
      expect(await op(owner, q, undefined, true)).not.toHaveProperty('refused')
    }
    expect(await op(owner, { op: 'create', branch: 'second', originUrl: '/p' }, { id: '33333333-3333-4333-8333-333333333333', readOnly: false })).toHaveProperty('head')
    expect(ran()).toBe(false)
  })
})

describe('links in a copy', () => {
  it('a branch ref that is a link outside the copy is not followed', async () => {
    const copy = await withCopy()
    const before = sh(owner.ws, ['rev-parse', 'login-page'])
    write(outside, 'tip', `${before}\n`)
    fs.rmSync(path.join(copy, '.git', 'refs', 'heads', 'login-page'))
    fs.symlinkSync(path.join(outside, 'tip'), path.join(copy, '.git', 'refs', 'heads', 'login-page'))
    expect(await bringBack()).toMatchObject({ moved: false, head: before })
  })

  it('a refs folder that is a link outside the copy is never written through', async () => {
    const copy = await withCopy()
    const heads = path.join(copy, '.git', 'refs', 'heads')
    fs.rmSync(heads, { recursive: true })
    fs.mkdirSync(path.join(outside, 'heads'))
    fs.symlinkSync(path.join(outside, 'heads'), heads)
    write(copy, 'a.txt', 'a\n')
    expect(await commit()).toMatchObject({ refused: 'refConflict' })
    expect(fs.readdirSync(path.join(outside, 'heads'))).toEqual([])
  })

  it('an index that is a link outside the copy is replaced, not written through', async () => {
    const copy = await withCopy()
    write(outside, 'index', 'untouched')
    fs.rmSync(path.join(copy, '.git', 'index'))
    fs.symlinkSync(path.join(outside, 'index'), path.join(copy, '.git', 'index'))
    write(copy, 'a.txt', 'a\n')
    expect(await commit()).toHaveProperty('commit')
    expect(fs.readFileSync(path.join(outside, 'index'), 'utf8')).toBe('untouched')
  })

  it('a link in the working tree is committed as a link, never as what it points at', async () => {
    const copy = await withCopy()
    write(outside, 'secret', 'do not read')
    fs.symlinkSync(path.join(outside, 'secret'), path.join(copy, 'leak'))
    const c = await commit()
    await bringBack()
    const blob = await op(owner, { op: 'readFile', rev: { commit: c.commit }, path: 'leak', max: 1000 }, undefined, true)
    expect(blob).toMatchObject({ exists: true, text: path.join(outside, 'secret') })
  })
})

describe('main moves only by a merge, a restore, turning Git on or a pull', () => {
  it('a copy cannot move main: its own main, a branch named main, and every other operation leave it', async () => {
    const copy = await withCopy()
    const main = sh(owner.ws, ['rev-parse', 'main'])
    write(copy, 'a.txt', 'a\n')
    sh(copy, ['add', '-A']); sh(copy, ['commit', '-qm', 'a'])
    sh(copy, ['branch', '-f', 'main', 'HEAD'])
    await commit()
    await bringBack()
    expect(await op(owner, { op: 'bringBack', branch: 'main', date: 'd' }, { id: COPY_A, readOnly: true })).toMatchObject({ refused: 'is_main' })
    expect(await op(owner, { op: 'commit', branch: 'main', message: 'x', author: AGENT, at: at() }, { id: COPY_A, readOnly: false }, true)).toMatchObject({ refused: 'is_main' })
    expect(await op(owner, { op: 'delete', branch: 'main' })).toMatchObject({ refused: 'is_main' })
    expect(await op(owner, { op: 'rename', from: 'main', to: 'x' })).toMatchObject({ refused: 'is_main' })
    expect(sh(owner.ws, ['rev-parse', 'main'])).toBe(main)
  })

  it('a branch whose objects fail Git\'s checks is not brought back', async () => {
    const copy = await withCopy()
    sh(copy, ['hash-object', '-w', '--stdin'], '')
    const tree = sh(copy, ['mktree'], '100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391\t.GIT\n')
    const bad = sh(copy, ['commit-tree', tree, '-m', 'bad'])
    sh(copy, ['update-ref', 'refs/heads/login-page', bad])
    const before = sh(owner.ws, ['rev-parse', 'login-page'])
    expect(await bringBack()).toMatchObject({ refused: 'badObjects' })
    expect(sh(owner.ws, ['rev-parse', 'login-page'])).toBe(before)
  })
})
