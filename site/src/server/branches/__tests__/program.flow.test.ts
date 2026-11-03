import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, AUTHOR, COPY_A, COPY_B, at, gitOn, makeOwner, op, sh, write, type Owner } from './gitFixture'

let owner: Owner
beforeEach(() => { owner = makeOwner() })
afterEach(() => { fs.rmSync(owner.root, { recursive: true, force: true }) })

const commitIn = (id: string, message: string) =>
  op(owner, { op: 'commit', branch: id === COPY_A ? 'login-page' : 'signup', message, author: AGENT, at: at() }, { id, readOnly: false }, true)
const bringBack = (id: string) =>
  op(owner, { op: 'bringBack', branch: id === COPY_A ? 'login-page' : 'signup', date: '2026-11-01' }, { id, readOnly: true })
const create = (id: string, branch: string) =>
  op(owner, { op: 'create', branch, originUrl: '/projects/p/workspaces/w1' }, { id, readOnly: false })

describe('the commit helper, end to end on real repositories @SC-1726', () => {
  it('turns Git on with a .gitignore, leaving large files out @SC-1693', async () => {
    write(owner.ws, 'big.bin', 'x'.repeat(2048))
    write(owner.ws, 'node_modules/a.js', 'x')
    const r = await op(owner, { op: 'init', author: AUTHOR, at: at(), message: 'First version', large: 1024, ignored: ['node_modules'] })
    expect(r).toMatchObject({ main: 'main', gitignoreAdded: true, leftOut: [{ path: 'big.bin', bytes: 2048 }], version: { number: 1, subject: 'First version', author: AUTHOR } })
    expect(sh(owner.ws, ['ls-files']).split('\n').sort()).toEqual(['.gitignore'])
    expect(sh(owner.ws, ['status', '--porcelain'])).toBe('?? big.bin')
    expect(await op(owner, { op: 'init', author: AUTHOR, at: at(), message: 'x', large: 1, ignored: [] })).toMatchObject({ refused: 'already_repository' })
  })

  it('makes a branch and its copy, commits in it, and brings the branch back', async () => {
    await gitOn(owner)
    const made = await create(COPY_A, 'login-page')
    expect(made.head).toMatch(/^[0-9a-f]{40}$/)
    const copy = owner.copyDir(COPY_A)
    expect(fs.readFileSync(path.join(copy, 'README.md'), 'utf8')).toBe('hello\n')
    expect(fs.readFileSync(path.join(copy, '.git', 'objects', 'info', 'alternates'), 'utf8').trim()).toBe('../../../../workspaces/w1/.git/objects')
    expect(sh(owner.ws, ['branch', '--list', 'login-page'])).toContain('login-page')

    write(copy, 'login.html', '<form></form>\n')
    const c = await commitIn(COPY_A, 'Add the login form\n\nOn-behalf-of: Ada Lovelace <ada@example.com>')
    expect(c).toMatchObject({ files: 1 })
    expect(sh(copy, ['status', '--porcelain'])).toBe('')
    expect(sh(copy, ['log', '-1', '--format=%an %s'])).toBe('Kernel Add the login form')

    const back = await bringBack(COPY_A)
    expect(back).toMatchObject({ moved: true, head: c.commit, previous: made.head, backup: null })
    expect(sh(owner.ws, ['rev-parse', 'login-page'])).toBe(c.commit)
    expect(sh(owner.ws, ['status', '--porcelain'])).toBe('')
    expect(await commitIn(COPY_A, 'again')).toEqual({ nothing: true })
    expect(await bringBack(COPY_A)).toMatchObject({ moved: false })
  })

  it('brings back commits the agent made with its own git, and keeps a backup of a rewritten branch @SC-1725', async () => {
    await gitOn(owner)
    await create(COPY_A, 'login-page')
    const copy = owner.copyDir(COPY_A)
    write(copy, 'a.txt', 'one\n')
    sh(copy, ['add', '-A']); sh(copy, ['commit', '-qm', 'one'])
    const first = await bringBack(COPY_A)
    expect(first).toMatchObject({ moved: true, backup: null })
    sh(copy, ['commit', '-q', '--amend', '-m', 'one, reworded'])
    const second = await bringBack(COPY_A)
    expect(second).toMatchObject({ moved: true, previous: first.head, backup: 'backup/login-page-2026-11-01' })
    expect(sh(owner.ws, ['rev-parse', 'backup/login-page-2026-11-01'])).toBe(first.head)
  })

  it('reads branches, changes, commits, files, folders and versions', async () => {
    await gitOn(owner, { 'README.md': 'hello\n', 'src/app.js': 'a\n' })
    await create(COPY_A, 'login-page')
    write(owner.copyDir(COPY_A), 'src/app.js', 'a\nb\n')
    write(owner.copyDir(COPY_A), 'bin.dat', 'x\0y')
    const c = await commitIn(COPY_A, 'Change the app\n\nOn-behalf-of: Ada Lovelace <ada@example.com>')
    await bringBack(COPY_A)
    const read = (q: Record<string, unknown>) => op(owner, q, undefined, true)

    const list = await read({ op: 'list', merged: [], max: 500 })
    expect(list).toMatchObject({ main: { name: 'main', versions: 1 }, overflow: false })
    expect((list.branches as unknown[])[0]).toMatchObject({ name: 'login-page', head: c.commit, ahead: 1, behind: 0, lastCommit: { subject: 'Change the app', author: AGENT, onBehalfOf: AUTHOR } })

    const changes = await read({ op: 'changes', branch: 'login-page', base: null, max: 1000 })
    expect(changes.files).toEqual(expect.arrayContaining([
      { path: 'src/app.js', status: 'modified', from: null, additions: 1, deletions: 0 },
      { path: 'bin.dat', status: 'added', from: null, additions: null, deletions: null },
    ]))
    expect(await read({ op: 'commits', branch: 'login-page', base: null, limit: 10 })).toMatchObject({ commits: [{ id: c.commit }], overflow: false })
    expect(await read({ op: 'readFile', rev: { branch: 'login-page' }, path: 'src/app.js', max: 1000 })).toEqual({ exists: true, binary: false, tooLarge: false, bytes: 4, text: 'a\nb\n' })
    expect(await read({ op: 'readFile', rev: { branch: 'login-page' }, path: 'bin.dat', max: 1000 })).toEqual({ exists: true, binary: true, bytes: 3 })
    expect(await read({ op: 'readFile', rev: { branch: 'main' }, path: 'nope', max: 1000 })).toEqual({ exists: false })
    expect(await read({ op: 'listTree', rev: { branch: 'login-page' }, path: '', max: 100 })).toMatchObject({
      exists: true, entries: [{ name: 'src', kind: 'dir', bytes: null }, { name: '.gitignore' }, { name: 'README.md', kind: 'file' }, { name: 'bin.dat', kind: 'file' }],
    })
    expect(await read({ op: 'listTree', rev: { branch: 'login-page' }, path: 'src', max: 100 })).toMatchObject({ entries: [{ name: 'app.js', path: 'src/app.js', bytes: 4 }] })
    expect(await read({ op: 'versions', limit: 10, before: null })).toMatchObject({ total: 1, versions: [{ number: 1, subject: 'First version', files: 3 }] })
  })

  it('merges a branch as one version, merges a checkpoint again without clashing, and restores', async () => {
    const first = await gitOn(owner)
    const v1 = (first.version as { commit: string }).commit
    await create(COPY_A, 'login-page')
    const copy = owner.copyDir(COPY_A)
    write(copy, 'a.txt', '1\n'); await commitIn(COPY_A, 'a1')
    write(copy, 'a.txt', '1\n2\n'); const c2 = await commitIn(COPY_A, 'a2')
    await bringBack(COPY_A)
    const merge = (expectedMain: string, base: unknown) =>
      op(owner, { op: 'merge', branch: 'login-page', base, expectedMain, message: 'Kernel for Ada · Login page', author: AUTHOR, at: at() })

    expect(await merge('0'.repeat(40), null)).toEqual({ moved: v1 })
    const m1 = await merge(v1, null)
    expect(m1).toMatchObject({ mergedCommit: c2.commit, version: { number: 2, subject: 'Kernel for Ada · Login page', author: AUTHOR, files: 1 } })
    const v2 = (m1.version as { commit: string }).commit
    expect(sh(owner.ws, ['rev-parse', 'main'])).toBe(v2)
    expect(sh(owner.ws, ['rev-list', '--count', 'main'])).toBe('2')
    expect(fs.readFileSync(path.join(owner.ws, 'a.txt'), 'utf8')).toBe('1\n2\n')
    const base = { mergedCommit: c2.commit, mergedVersion: v2 }
    expect(await merge(v2, base)).toEqual({ nothing: true })

    write(copy, 'a.txt', '1\n2\n3\n'); const c3 = await commitIn(COPY_A, 'a3')
    await bringBack(COPY_A)
    const listed = await op(owner, { op: 'list', merged: [{ branch: 'login-page', base }], max: 500 }, undefined, true)
    expect((listed.branches as unknown[])[0]).toMatchObject({ ahead: 1, behind: 0 })
    const m2 = await merge(v2, base)
    expect(m2).toMatchObject({ mergedCommit: c3.commit, version: { number: 3 } })
    const v3 = (m2.version as { commit: string }).commit

    expect(await op(owner, { op: 'restore', version: v3, expectedMain: v3, message: 'x', author: AUTHOR, at: at() })).toEqual({ same: true })
    const r = await op(owner, { op: 'restore', version: v1, expectedMain: v3, message: 'Restored version 1', author: AUTHOR, at: at() })
    expect(r).toMatchObject({ version: { number: 4, subject: 'Restored version 1' } })
    expect(fs.existsSync(path.join(owner.ws, 'a.txt'))).toBe(false)
  })

  it('names the files that clash and the version that changed them, and merges nothing', async () => {
    const first = await gitOn(owner, { 'shared.txt': 'base\n' })
    const v1 = (first.version as { commit: string }).commit
    await create(COPY_A, 'login-page')
    await create(COPY_B, 'signup')
    write(owner.copyDir(COPY_A), 'shared.txt', 'from a\n'); await commitIn(COPY_A, 'a'); await bringBack(COPY_A)
    write(owner.copyDir(COPY_B), 'shared.txt', 'from b\n'); await commitIn(COPY_B, 'b'); await bringBack(COPY_B)
    const m = await op(owner, { op: 'merge', branch: 'login-page', base: null, expectedMain: v1, message: 'Login', author: AUTHOR, at: at() })
    const v2 = (m.version as { commit: string }).commit
    const clash = await op(owner, { op: 'merge', branch: 'signup', base: null, expectedMain: v2, message: 'Signup', author: AUTHOR, at: at() })
    expect(clash).toEqual({ clashes: [{ path: 'shared.txt', version: { number: 2, commit: v2, subject: 'Login' } }] })
    expect(sh(owner.ws, ['rev-parse', 'main'])).toBe(v2)
  })

  it('renames and deletes a branch, counting the commits only it had, and removes a copy', async () => {
    await gitOn(owner)
    await create(COPY_A, 'login-page')
    write(owner.copyDir(COPY_A), 'a.txt', '1\n'); await commitIn(COPY_A, 'a'); await bringBack(COPY_A)
    expect(await op(owner, { op: 'rename', from: 'login-page', to: 'sign-in' }, { id: COPY_A, readOnly: false })).toEqual({ name: 'sign-in' })
    expect(sh(owner.copyDir(COPY_A), ['symbolic-ref', 'HEAD'])).toBe('refs/heads/sign-in')
    expect(await op(owner, { op: 'rename', from: 'sign-in', to: 'main' })).toMatchObject({ refused: 'is_main' })
    expect(await op(owner, { op: 'delete', branch: 'sign-in' })).toEqual({ lostCommits: 1 })
    expect(sh(owner.ws, ['branch', '--list'])).toBe('* main')
    expect(await op(owner, { op: 'removeCopy' }, { id: COPY_A, readOnly: false })).toEqual({ removed: true })
    expect(fs.readdirSync(owner.copyDir(COPY_A))).toEqual([])
  })

  it('refuses to make a branch that exists, or to name main', async () => {
    await gitOn(owner)
    await create(COPY_A, 'login-page')
    expect(await create(COPY_B, 'login-page')).toMatchObject({ refused: 'branch_exists' })
    expect(await create(COPY_B, 'main')).toMatchObject({ refused: 'is_main' })
    expect(await op(owner, { op: 'bringBack', branch: 'main', date: 'x' }, { id: COPY_A, readOnly: true })).toMatchObject({ refused: 'is_main' })
  })
})
