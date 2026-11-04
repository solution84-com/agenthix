import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AUTHOR, COPY_A, at, gitOn, makeOwner, op, sh, write, type Owner } from './gitFixture'

let owner: Owner
beforeEach(() => { owner = makeOwner() })
afterEach(() => {
  fs.chmodSync(owner.root, 0o755)
  for (const dir of [owner.ws, owner.copyDir(COPY_A)]) { try { fs.chmodSync(dir, 0o755) } catch { /* not made */ } }
  try { fs.chmodSync(path.join(owner.ws, 'secret.txt'), 0o644) } catch { /* not made */ }
  fs.rmSync(owner.root, { recursive: true, force: true })
})

const init = () => op(owner, { op: 'init', author: AUTHOR, at: at(), message: 'First version', large: 1 << 20, ignored: [] })

describe('the commit helper undoes what a failed call made', () => {
  it('turning Git on that fails partway leaves no .git behind, so a retry works (F-site-15-02)', async () => {
    write(owner.ws, 'secret.txt', 'x\n')
    fs.chmodSync(path.join(owner.ws, 'secret.txt'), 0o000)
    const failed = await init().catch((e: unknown) => ({ thrown: e }))
    expect(failed).not.toHaveProperty('version')
    expect(fs.existsSync(path.join(owner.ws, '.git'))).toBe(false)
    expect(fs.existsSync(path.join(owner.ws, '.gitignore'))).toBe(false)
    fs.chmodSync(path.join(owner.ws, 'secret.txt'), 0o644)
    expect(await init()).toMatchObject({ main: 'main', version: { number: 1 } })
  })

  it('a branch whose copy cannot be made is not left in the workspace (F-site-15-04)', async () => {
    await gitOn(owner)
    fs.mkdirSync(owner.copyDir(COPY_A), { recursive: true })
    fs.chmodSync(owner.copyDir(COPY_A), 0o555)
    const failed = await op(owner, { op: 'create', branch: 'login-page', originUrl: '/projects/p/workspaces/w1' }, { id: COPY_A, readOnly: false }).catch((e: unknown) => ({ thrown: e }))
    expect(failed).not.toHaveProperty('head')
    expect(sh(owner.ws, ['branch', '--list', 'login-page'])).toBe('')
    fs.chmodSync(owner.copyDir(COPY_A), 0o755)
    const again = await op(owner, { op: 'create', branch: 'login-page', originUrl: '/projects/p/workspaces/w1' }, { id: COPY_A, readOnly: false })
    expect(again.head).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe('a file named with a leading dash in a branch', () => {
  it('is listed in the tree, as it is in the changes (F-core-4-01)', async () => {
    await gitOn(owner, { 'README.md': 'hello\n', '-dash.txt': 'x\n' })
    const tree = await op(owner, { op: 'listTree', rev: { branch: 'main' }, path: '', max: 100 }, undefined, true)
    expect((tree.entries as Array<{ name: string }>).map(e => e.name)).toContain('-dash.txt')
  })
})
