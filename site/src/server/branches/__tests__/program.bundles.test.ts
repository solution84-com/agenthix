/**
 * Live previews' own copies and Git bundles, through the commit helper against real repositories: `main`'s own copy,
 * a branch carried to another site and its commits carried back, and what an agent planted in a copy never running.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runHelper } from '../helperContainer'
import { AGENT, COPY_A, COPY_B, at, gitOn, local, makeOwner, op, sh, write, type Owner } from './gitFixture'

let owner: Owner
let elsewhere: Owner
let data: string
beforeEach(() => {
  owner = makeOwner()
  elsewhere = makeOwner()
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'bundles-'))
})
afterEach(() => {
  for (const d of [owner.root, elsewhere.root, data]) fs.rmSync(d, { recursive: true, force: true })
})

const helper = (spec: Record<string, unknown>, request: Record<string, unknown>) =>
  runHelper({ workspaceId: 'w1', network: false, timeoutMs: 60_000, ...spec }, request, local)

async function branchWithCommit(): Promise<string> {
  await gitOn(owner)
  await op(owner, { op: 'create', branch: 'login-page', originUrl: '/p/workspaces/w1' }, { id: COPY_A, readOnly: false })
  write(owner.copyDir(COPY_A), 'login.html', '<form></form>\n')
  const made = await op(owner, { op: 'commit', branch: 'login-page', message: 'Add login', author: AGENT, at: at() }, { id: COPY_A, readOnly: false }, true)
  await op(owner, { op: 'bringBack', branch: 'login-page', date: '2026-11-02' }, { id: COPY_A, readOnly: true })
  return String(made.commit)
}

async function makeBundle(spec: Record<string, unknown>, request: Record<string, unknown>, name: string) {
  const out = path.join(data, name)
  fs.mkdirSync(out)
  const answer = await helper({ ...spec, out: { dir: out } }, { op: 'bundleMake', ...request })
  return { answer, file: path.join(out, 'bundle') }
}

describe("main's own copy @SC-1741", () => {
  it('holds main\'s objects itself, with no link to the workspace, and follows main', async () => {
    await gitOn(owner)
    const dir = path.join(data, 'main-copy')
    fs.mkdirSync(dir)
    const made = await helper({ ws: { dir: owner.ws, readOnly: true }, copy: { dir, readOnly: false } }, { op: 'mainCopy' })
    expect(made.refused).toBeUndefined()
    expect(fs.readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('hello\n')
    expect(fs.existsSync(path.join(dir, '.git', 'objects', 'info', 'alternates'))).toBe(false)
    write(dir, 'dist/app.js', 'built\n')
    write(owner.ws, 'README.md', 'hello again\n')
    sh(owner.ws, ['commit', '-qam', 'v2'])
    const tip = sh(owner.ws, ['rev-parse', 'HEAD'])
    const refreshed = await helper({ ws: { dir: owner.ws, readOnly: true }, copy: { dir, readOnly: false } }, { op: 'refreshMain', head: tip })
    expect(refreshed.head).toBe(tip)
    expect(fs.readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('hello again\n')
    expect(fs.readFileSync(path.join(dir, 'dist/app.js'), 'utf8')).toBe('built\n')
  })

  it('refuses to move to a head main is not at', async () => {
    await gitOn(owner)
    const dir = path.join(data, 'main-copy')
    fs.mkdirSync(dir)
    await helper({ ws: { dir: owner.ws, readOnly: true }, copy: { dir, readOnly: false } }, { op: 'mainCopy' })
    const answer = await helper({ ws: { dir: owner.ws, readOnly: true }, copy: { dir, readOnly: false } }, { op: 'refreshMain', head: 'a'.repeat(40) })
    expect(answer.refused).toBe('not_found')
  })
})

describe('a branch carried to another site and back @SC-1740', () => {
  it('goes as a bundle with main beside it, becomes a copy there, and its commits come back by name only', async () => {
    const tip = await branchWithCommit()
    const { answer: made, file } = await makeBundle({ ws: { dir: owner.ws, readOnly: true } }, { kind: 'branch', branch: 'login-page', prerequisites: [] }, 'to')
    expect(made.head).toBe(tip)
    expect(fs.statSync(file).size).toBeGreaterThan(0)

    const there = elsewhere.copyDir(COPY_B)
    fs.mkdirSync(there, { recursive: true })
    const copied = await helper({ copy: { dir: there, readOnly: false }, bundle: { file } }, { op: 'bundleCopy', branch: 'login-page' })
    expect(copied.head).toBe(tip)
    expect(fs.readFileSync(path.join(there, 'login.html'), 'utf8')).toBe('<form></form>\n')
    expect(sh(there, ['rev-parse', 'refs/remotes/origin/main'])).toBe(sh(owner.ws, ['rev-parse', 'main']))

    write(there, 'login.css', 'form{}\n')
    const committed = await helper({ copy: { dir: there, readOnly: false } }, { op: 'copyCommit', branch: 'login-page', message: 'Style it\n', author: AGENT, at: at() })
    expect(typeof committed.commit).toBe('string')
    expect((await helper({ copy: { dir: there, readOnly: false } }, { op: 'copyCommit', branch: 'login-page', message: 'x\n', author: AGENT, at: at() })).nothing).toBe(true)

    const { answer: back, file: backFile } = await makeBundle({ copy: { dir: there, readOnly: true } }, { kind: 'livePreview', branch: 'login-page', prerequisites: [tip] }, 'back')
    expect(back.head).toBe(committed.commit)
    const mainBefore = sh(owner.ws, ['rev-parse', 'main'])
    const brought = await helper({ ws: { dir: owner.ws, readOnly: false }, bundle: { file: backFile } }, { op: 'bringBackBundle', branch: 'login-page', expectedPrevious: tip, date: '2026-11-02' })
    expect(brought).toMatchObject({ head: committed.commit, previous: tip, moved: true, backup: null })
    expect(sh(owner.ws, ['rev-parse', 'login-page'])).toBe(committed.commit)
    expect(sh(owner.ws, ['rev-parse', 'main'])).toBe(mainBefore)
  })

  it('brings main into a copy there from the bundle of main that came after it, with no workspace beside it', async () => {
    await branchWithCommit()
    const { file } = await makeBundle({ ws: { dir: owner.ws, readOnly: true } }, { kind: 'branch', branch: 'login-page', prerequisites: [] }, 'to')
    const there = elsewhere.copyDir(COPY_B)
    fs.mkdirSync(there, { recursive: true })
    await helper({ copy: { dir: there, readOnly: false }, bundle: { file } }, { op: 'bundleCopy', branch: 'login-page' })
    write(owner.ws, 'NEWS.md', 'news\n')
    sh(owner.ws, ['add', 'NEWS.md'])
    sh(owner.ws, ['commit', '-qm', 'v2'])
    const mainTip = sh(owner.ws, ['rev-parse', 'main'])
    const { file: mainFile } = await makeBundle({ ws: { dir: owner.ws, readOnly: true } }, { kind: 'main', prerequisites: [] }, 'main')
    const refreshed = await helper({ copy: { dir: there, readOnly: false }, bundle: { file: mainFile } }, { op: 'bundleRefresh', branch: 'login-page', onMain: false, head: mainTip })
    expect(refreshed.head).toBe(mainTip)
    const updated = await helper({ copy: { dir: there, readOnly: false } }, { op: 'updateFromMain', branch: 'login-page', message: 'Bring main in\n', author: AGENT, at: at() })
    expect(updated.refused).toBeUndefined()
    expect(typeof updated.commit).toBe('string')
    expect(fs.readFileSync(path.join(there, 'NEWS.md'), 'utf8')).toBe('news\n')
  })

  it('brings nothing back when the branch moved meanwhile, and says where it is', async () => {
    const tip = await branchWithCommit()
    const { file } = await makeBundle({ ws: { dir: owner.ws, readOnly: true } }, { kind: 'branch', branch: 'login-page', prerequisites: [] }, 'to')
    const answer = await helper({ ws: { dir: owner.ws, readOnly: false }, bundle: { file } }, { op: 'bringBackBundle', branch: 'login-page', expectedPrevious: null, date: '2026-11-02' })
    expect(answer).toMatchObject({ movedMeanwhile: true, head: tip })
  })

  it('makes nothing when the source has nothing after the prerequisites', async () => {
    const tip = await branchWithCommit()
    const main = sh(owner.ws, ['rev-parse', 'main'])
    const { answer, file } = await makeBundle({ ws: { dir: owner.ws, readOnly: true } }, { kind: 'branch', branch: 'login-page', prerequisites: [tip, main] }, 'none')
    expect(answer).toMatchObject({ nothing: true, head: tip })
    expect(fs.existsSync(file)).toBe(false)
  })

  it('never bundles or brings back main as a branch', async () => {
    await gitOn(owner)
    const { answer } = await makeBundle({ ws: { dir: owner.ws, readOnly: true } }, { kind: 'branch', branch: 'main', prerequisites: [] }, 'main')
    expect(answer.refused).toBe('is_main')
  })

  it('runs no hook or setting an agent planted in the copy there', async () => {
    const tip = await branchWithCommit()
    const { file } = await makeBundle({ ws: { dir: owner.ws, readOnly: true } }, { kind: 'branch', branch: 'login-page', prerequisites: [] }, 'to')
    const there = elsewhere.copyDir(COPY_B)
    fs.mkdirSync(there, { recursive: true })
    await helper({ copy: { dir: there, readOnly: false }, bundle: { file } }, { op: 'bundleCopy', branch: 'login-page' })
    const marker = path.join(data, 'ran')
    const hook = `#!/bin/sh\ntouch '${marker}'\n`
    fs.mkdirSync(path.join(there, '.git', 'hooks'), { recursive: true })
    for (const h of ['pre-commit', 'post-commit', 'reference-transaction', 'pre-push']) fs.writeFileSync(path.join(there, '.git', 'hooks', h), hook, { mode: 0o755 })
    fs.appendFileSync(path.join(there, '.git', 'config'), `[core]\n\tfsmonitor = touch '${marker}'\n\thooksPath = .git/hooks\n`)
    write(there, 'x.txt', 'x\n')
    await helper({ copy: { dir: there, readOnly: false } }, { op: 'copyCommit', branch: 'login-page', message: 'x\n', author: AGENT, at: at() })
    await makeBundle({ copy: { dir: there, readOnly: true } }, { kind: 'livePreview', branch: 'login-page', prerequisites: [tip] }, 'back')
    expect(fs.existsSync(marker)).toBe(false)
  })

  it('refuses a bundle that is a link rather than a file', async () => {
    await branchWithCommit()
    const link = path.join(data, 'link.bundle')
    fs.symlinkSync('/etc/hosts', link)
    const there = elsewhere.copyDir(COPY_B)
    fs.mkdirSync(there, { recursive: true })
    const answer = await helper({ copy: { dir: there, readOnly: false }, bundle: { file: link } }, { op: 'bundleCopy', branch: 'login-page' })
    expect(answer.refused).toBe('noBundle')
  })
})
