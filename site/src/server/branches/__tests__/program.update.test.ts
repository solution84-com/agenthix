import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, AUTHOR, COPY_A, COPY_B, at, gitOn, makeOwner, op, sh, write, type Owner } from './gitFixture'

let owner: Owner
beforeEach(() => { owner = makeOwner() })
afterEach(() => { fs.rmSync(owner.root, { recursive: true, force: true }) })

const BRANCH: Record<string, string> = { [COPY_A]: 'login-page', [COPY_B]: 'signup' }
const commitIn = (id: string, message: string) =>
  op(owner, { op: 'commit', branch: BRANCH[id], message, author: AGENT, at: at() }, { id, readOnly: false }, true)
const bringBack = (id: string) => op(owner, { op: 'bringBack', branch: BRANCH[id], date: '2026-11-01' }, { id, readOnly: true })
const create = (id: string) => op(owner, { op: 'create', branch: BRANCH[id], originUrl: '/projects/p/workspaces/w1' }, { id, readOnly: false })
const update = (id: string) =>
  op(owner, { op: 'updateFromMain', branch: BRANCH[id], message: `Merge main into ${BRANCH[id]}\n`, author: AGENT, at: at() }, { id, readOnly: false }, true)
const mainTip = () => sh(owner.ws, ['rev-parse', 'main'])

/** Main moves by merging signup, which wrote `file` as `body`. */
async function mainChanges(file: string, body: string): Promise<string> {
  write(owner.copyDir(COPY_B), file, body)
  await commitIn(COPY_B, 'b')
  await bringBack(COPY_B)
  const m = await op(owner, { op: 'merge', branch: 'signup', base: null, expectedMain: mainTip(), message: 'Signup', author: AUTHOR, at: at() })
  return (m.version as { commit: string }).commit
}

describe('bringing main into a branch\'s copy', () => {
  beforeEach(async () => {
    await gitOn(owner, { 'README.md': 'hello\n', 'shared.txt': 'one\ntwo\nthree\n' })
    await create(COPY_A)
    await create(COPY_B)
  })

  it('says a branch with all of main is up to date, and changes nothing', async () => {
    const head = sh(owner.copyDir(COPY_A), ['rev-parse', 'HEAD'])
    expect(await update(COPY_A)).toEqual({ upToDate: head })
  })

  it('moves a branch with nothing of its own to main', async () => {
    const v2 = await mainChanges('b.txt', 'b\n')
    expect(await update(COPY_A)).toEqual({ commit: v2, fastForward: true })
    const copy = owner.copyDir(COPY_A)
    expect(fs.readFileSync(path.join(copy, 'b.txt'), 'utf8')).toBe('b\n')
    expect(sh(copy, ['status', '--porcelain'])).toBe('')
  })

  it('commits a clean merge with main as its second parent, which then merges into main without a clash', async () => {
    write(owner.copyDir(COPY_A), 'a.txt', 'a\n')
    const own = await commitIn(COPY_A, 'a')
    const v2 = await mainChanges('b.txt', 'b\n')
    const u = await update(COPY_A)
    expect(u).toMatchObject({ fastForward: false })
    const copy = owner.copyDir(COPY_A)
    expect(sh(copy, ['rev-list', '--parents', '-n', '1', String(u.commit)]).split(' ')).toEqual([u.commit, own.commit, v2])
    expect(sh(copy, ['log', '-1', '--format=%an %s'])).toBe('Kernel Merge main into login-page')
    expect(sh(copy, ['status', '--porcelain'])).toBe('')
    expect(fs.readFileSync(path.join(copy, 'b.txt'), 'utf8')).toBe('b\n')
    await bringBack(COPY_A)
    const m = await op(owner, { op: 'merge', branch: 'login-page', base: null, expectedMain: v2, message: 'Login', author: AUTHOR, at: at() })
    expect(m).toMatchObject({ version: { number: 3 } })
  })

  it('leaves clashes in the copy with markers, refuses a commit that keeps them, and finishes the merge on the next', async () => {
    const copy = owner.copyDir(COPY_A)
    write(copy, 'shared.txt', 'one\nTWO from a\nthree\n')
    const own = await commitIn(COPY_A, 'a')
    const v2 = await mainChanges('shared.txt', 'one\nTWO from b\nthree\n')

    expect(await update(COPY_A)).toEqual({ clashes: ['shared.txt'], mainTip: v2 })
    expect(fs.readFileSync(path.join(copy, 'shared.txt'), 'utf8')).toMatch(/^<{7} .*\nTWO from a\n={7}\nTWO from b\n>{7} /m)
    expect(fs.readFileSync(path.join(copy, '.git', 'MERGE_HEAD'), 'utf8').trim()).toBe(v2)
    expect(await update(COPY_A)).toEqual({ mergeUnderWay: ['shared.txt'] })
    expect(await commitIn(COPY_A, 'too soon')).toEqual({ clashesLeft: ['shared.txt'] })
    expect(sh(copy, ['rev-parse', 'HEAD'])).toBe(own.commit)

    write(copy, 'shared.txt', 'one\nTWO from a and b\nthree\n')
    const done = await commitIn(COPY_A, 'Bring main in')
    expect(sh(copy, ['rev-list', '--parents', '-n', '1', String(done.commit)]).split(' ')).toEqual([done.commit, own.commit, v2])
    expect(fs.existsSync(path.join(copy, '.git', 'MERGE_HEAD'))).toBe(false)
    expect(fs.existsSync(path.join(copy, '.git', 'MERGE_MSG'))).toBe(false)
    await bringBack(COPY_A)
    const m = await op(owner, { op: 'merge', branch: 'login-page', base: null, expectedMain: v2, message: 'Login', author: AUTHOR, at: at() })
    expect(m).toMatchObject({ version: { number: 3 } })
    expect(fs.readFileSync(path.join(owner.ws, 'shared.txt'), 'utf8')).toBe('one\nTWO from a and b\nthree\n')
  })

  it('does nothing while the copy has changes not committed', async () => {
    await mainChanges('b.txt', 'b\n')
    write(owner.copyDir(COPY_A), 'a.txt', 'a\n')
    expect(await update(COPY_A)).toEqual({ uncommitted: true })
    expect(fs.existsSync(path.join(owner.copyDir(COPY_A), 'b.txt'))).toBe(false)
  })

  it('drops a merge head the agent planted that is no commit, and commits as usual', async () => {
    const copy = owner.copyDir(COPY_A)
    fs.writeFileSync(path.join(copy, '.git', 'MERGE_HEAD'), 'f'.repeat(40) + '\n')
    write(copy, 'a.txt', 'a\n')
    const c = await commitIn(COPY_A, 'a')
    expect(sh(copy, ['rev-list', '--parents', '-n', '1', String(c.commit)]).split(' ')).toHaveLength(2)
    expect(fs.existsSync(path.join(copy, '.git', 'MERGE_HEAD'))).toBe(false)
  })

  it('replaces a link planted where the merge record goes, never writing through it', async () => {
    const copy = owner.copyDir(COPY_A)
    write(copy, 'shared.txt', 'one\nTWO from a\nthree\n')
    await commitIn(COPY_A, 'a')
    await mainChanges('shared.txt', 'one\nTWO from b\nthree\n')
    const target = path.join(owner.root, 'outside.txt')
    fs.writeFileSync(target, 'kept\n')
    fs.symlinkSync(target, path.join(copy, '.git', 'MERGE_MSG'))
    expect(await update(COPY_A)).toMatchObject({ clashes: ['shared.txt'] })
    expect(fs.readFileSync(target, 'utf8')).toBe('kept\n')
    expect(fs.lstatSync(path.join(copy, '.git', 'MERGE_MSG')).isSymbolicLink()).toBe(false)
  })
})
