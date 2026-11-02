/**
 * The branch methods as hq calls them: params checked, the workspace placed by the site's own rows, every copy checked
 * against the site's own record, and refusals in the vocabulary hq reads, naming no path on this disk. Real Git, run
 * by the helper as a local process; the database is an in-memory stand-in.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BranchWorkError, RepoWorkError } from '@agenthix/core'

const db = vi.hoisted(() => {
  type Copy = { id: string; ownerType: string; ownerId: string; workspaceId: string; branch: string; backPending: boolean }
  const copies = new Map<string, Copy>()
  const workspaces = new Set<string>()
  const match = (c: Copy, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => (c as Record<string, unknown>)[k] === v)
  return {
    copies, workspaces,
    prisma: {
      workspace: { findFirst: async ({ where }: { where: { id: string } }) => (workspaces.has(where.id) ? { id: where.id } : null) },
      repoAttachment: { findUnique: async () => null },
      branchCopy: {
        findUnique: async ({ where }: { where: { id: string } }) => copies.get(where.id) ?? null,
        findMany: async ({ where }: { where: Record<string, unknown> }) => [...copies.values()].filter(c => match(c, where)),
        create: async ({ data }: { data: Omit<Copy, 'backPending'> }) => { copies.set(data.id, { ...data, backPending: false }); return copies.get(data.id) },
        update: async ({ where, data }: { where: { id: string }; data: Partial<Copy> }) => Object.assign(copies.get(where.id)!, data),
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Copy> }) => {
          const hit = [...copies.values()].filter(c => match(c, where))
          for (const c of hit) Object.assign(c, data)
          return { count: hit.length }
        },
        delete: async ({ where }: { where: { id: string } }) => { const c = copies.get(where.id); copies.delete(where.id); return c },
        deleteMany: async ({ where }: { where: { id: string } }) => ({ count: copies.delete(where.id) ? 1 : 0 }),
      },
    },
  }
})
vi.mock('#db', () => ({ prisma: db.prisma }))
vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: { sendEvent: vi.fn(), onOpen: vi.fn() } }))

import { channelMethods } from '../../hq/channelMethods'
import { AGENT, AUTHOR, COPY_A, COPY_B, sh, write } from './gitFixture'

let root: string
const workspace = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' }
const wsDir = () => path.join(root, 'projects', 'p1', 'workspaces', 'w1')
const call = (method: string, params: unknown) => (channelMethods as unknown as Record<string, (p: unknown) => Promise<Record<string, unknown>>>)[method]!(params)

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'branch-methods-'))
  process.env.SITE_ROOT = root
  delete process.env.AGENT_CONTAINER_ISOLATION
  db.copies.clear()
  db.workspaces.clear()
  db.workspaces.add('w1')
  fs.mkdirSync(wsDir(), { recursive: true })
  write(wsDir(), 'README.md', 'hello\n')
})
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

describe('turning Git on, then a branch from making to merging', () => {
  it('works through every method hq calls', async () => {
    const init = await call('git.init', { workspace, author: AUTHOR })
    expect(init).toMatchObject({ main: 'main', gitignoreAdded: true, version: { number: 1, author: AUTHOR } })

    const made = await call('branch.create', { workspace, copyId: COPY_A, branch: 'add-login-page' })
    expect(made).toMatchObject({ branch: 'add-login-page', copyId: COPY_A, head: (init.version as { commit: string }).commit })
    expect(db.copies.get(COPY_A)).toMatchObject({ workspaceId: 'w1', branch: 'add-login-page' })

    const copy = path.join(root, 'projects', 'p1', 'clones', COPY_A)
    write(copy, 'login.html', '<form></form>\n')
    const committed = await call('branch.commit', {
      workspace, copyId: COPY_A, branch: 'add-login-page', message: 'Add the login form', author: AGENT, onBehalfOf: AUTHOR, runId: 'run-1',
    })
    expect(committed).toMatchObject({ committed: true, files: 1, back: { moved: true } })
    expect(sh(wsDir(), ['log', '-1', '--format=%B', 'add-login-page'])).toBe('Add the login form\n\nOn-behalf-of: Ada Lovelace <ada@example.com>')
    expect(await call('branch.commit', { workspace, copyId: COPY_A, branch: 'add-login-page', message: 'x', author: AGENT, onBehalfOf: null, runId: 'r' }))
      .toEqual({ committed: false, reason: 'nothing_to_commit' })

    const listed = await call('branch.list', { workspace, merged: [] })
    expect(listed).toMatchObject({ main: { name: 'main', versions: 1 }, branches: [{ name: 'add-login-page', ahead: 1, behind: 0 }] })
    const main = (listed.main as { head: string }).head
    const merged = await call('git.merge', { workspace, branch: 'add-login-page', base: null, expectedMain: main, message: 'Kernel for Ada · Login page', author: AUTHOR })
    expect(merged).toMatchObject({ merged: true, version: { number: 2 }, mergedCommit: committed.commit })
    expect(await call('git.merge', { workspace, branch: 'add-login-page', base: null, expectedMain: main, message: 'again', author: AUTHOR }))
      .toEqual({ merged: false, reason: 'main_moved', main: (merged.version as { commit: string }).commit })

    expect(await call('git.versions', { workspace, limit: 10, before: null })).toMatchObject({ total: 2 })
    expect(await call('git.listTree', { workspace, rev: { branch: 'main' }, path: '' })).toMatchObject({ exists: true })
    expect(await call('branch.removeCopy', { workspace, copyId: COPY_A })).toEqual({ removed: true })
    expect(await call('branch.removeCopy', { workspace, copyId: COPY_A })).toEqual({ removed: false })
    expect(fs.existsSync(copy)).toBe(false)
    expect(db.copies.has(COPY_A)).toBe(false)
  })
})

describe('branch.updateFromMain', () => {
  const update = (branch: string, copyId = COPY_B) =>
    call('branch.updateFromMain', { workspace, copyId, branch, author: AGENT, onBehalfOf: AUTHOR, runId: 'run-1' })
  const copyOf = (id: string) => path.join(root, 'projects', 'p1', 'clones', id)

  it('merges main into the branch with the person named, brings it back, and reports clashes as the copy holds them', async () => {
    const init = await call('git.init', { workspace, author: AUTHOR })
    await call('branch.create', { workspace, copyId: COPY_A, branch: 'add-login-page' })
    await call('branch.create', { workspace, copyId: COPY_B, branch: 'signup' })
    expect(await update('signup')).toEqual({ outcome: 'up_to_date', head: (init.version as { commit: string }).commit })

    write(copyOf(COPY_A), 'README.md', 'hello from a\n')
    await call('branch.commit', { workspace, copyId: COPY_A, branch: 'add-login-page', message: 'a', author: AGENT, onBehalfOf: null, runId: 'r' })
    const main = (init.version as { commit: string }).commit
    await call('git.merge', { workspace, branch: 'add-login-page', base: null, expectedMain: main, message: 'Login', author: AUTHOR })

    write(copyOf(COPY_B), 'signup.html', '<form></form>\n')
    await call('branch.commit', { workspace, copyId: COPY_B, branch: 'signup', message: 'b', author: AGENT, onBehalfOf: null, runId: 'r' })
    const done = await update('signup')
    expect(done).toMatchObject({ outcome: 'updated', fastForward: false, back: { moved: true } })
    expect(sh(wsDir(), ['rev-parse', 'signup'])).toBe(done.commit)
    expect(sh(wsDir(), ['log', '-1', '--format=%B', 'signup'])).toBe('Merge main into signup\n\nOn-behalf-of: Ada Lovelace <ada@example.com>')

    write(copyOf(COPY_B), 'x.txt', 'not committed\n')
    expect(await update('signup')).toEqual({ outcome: 'uncommitted' })
    expect(await update('add-login-page', COPY_B).catch((e: unknown) => (e as BranchWorkError).code)).toBe('no_copy')
  })

  it('answers clashes and a commit that keeps their markers in the words hq reads', async () => {
    write(wsDir(), 'README.md', 'one\n')
    const init = await call('git.init', { workspace, author: AUTHOR })
    await call('branch.create', { workspace, copyId: COPY_A, branch: 'add-login-page' })
    await call('branch.create', { workspace, copyId: COPY_B, branch: 'signup' })
    write(copyOf(COPY_A), 'README.md', 'from a\n')
    await call('branch.commit', { workspace, copyId: COPY_A, branch: 'add-login-page', message: 'a', author: AGENT, onBehalfOf: null, runId: 'r' })
    const merged = await call('git.merge', { workspace, branch: 'add-login-page', base: null, expectedMain: (init.version as { commit: string }).commit, message: 'Login', author: AUTHOR })
    write(copyOf(COPY_B), 'README.md', 'from b\n')
    await call('branch.commit', { workspace, copyId: COPY_B, branch: 'signup', message: 'b', author: AGENT, onBehalfOf: null, runId: 'r' })

    expect(await update('signup')).toEqual({ outcome: 'clashes', paths: ['README.md'], mainTip: (merged.version as { commit: string }).commit })
    expect(await update('signup')).toEqual({ outcome: 'merge_under_way', paths: ['README.md'] })
    expect(await call('branch.commit', { workspace, copyId: COPY_B, branch: 'signup', message: 'm', author: AGENT, onBehalfOf: null, runId: 'r' }))
      .toEqual({ committed: false, reason: 'clashes_left', paths: ['README.md'] })
    write(copyOf(COPY_B), 'README.md', 'from a and b\n')
    expect(await call('branch.commit', { workspace, copyId: COPY_B, branch: 'signup', message: 'm', author: AGENT, onBehalfOf: null, runId: 'r' }))
      .toMatchObject({ committed: true, back: { moved: true } })
  })
})

describe('the site\'s own record of a copy decides, never the copy', () => {
  beforeEach(async () => {
    await call('git.init', { workspace, author: AUTHOR })
    await call('branch.create', { workspace, copyId: COPY_A, branch: 'add-login-page' })
  })

  it('a call naming another branch for a copy, or a copy it has no record of, is refused no_copy', async () => {
    const ask = (copyId: string, branch: string) => call('branch.bringBack', { workspace, copyId, branch })
    for (const [copyId, branch] of [[COPY_A, 'signup'], [COPY_B, 'add-login-page']] as const) {
      const err = await ask(copyId, branch).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(BranchWorkError)
      expect((err as BranchWorkError).code).toBe('no_copy')
      expect((err as Error).message).not.toContain(root)
    }
  })

  it('a copy of another workspace is not this one\'s', async () => {
    db.workspaces.add('w2')
    fs.mkdirSync(path.join(root, 'projects', 'p1', 'workspaces', 'w2'), { recursive: true })
    const err = await call('branch.bringBack', { workspace: { ...workspace, workspaceId: 'w2' }, copyId: COPY_A, branch: 'add-login-page' }).catch((e: unknown) => e)
    expect((err as BranchWorkError).code).toBe('no_copy')
  })

  it('a rename moves the record with the branch, and a copy id in use is refused', async () => {
    expect(await call('branch.rename', { workspace, from: 'add-login-page', to: 'sign-in', copyId: COPY_A })).toEqual({ renamed: true, name: 'sign-in' })
    expect(db.copies.get(COPY_A)?.branch).toBe('sign-in')
    const err = await call('branch.copy', { workspace, copyId: COPY_A, branch: 'sign-in' }).catch((e: unknown) => e)
    expect((err as BranchWorkError).code).toBe('copy_exists')
  })

  it('deleting a branch says how many commits are lost and removes its copy', async () => {
    write(path.join(root, 'projects', 'p1', 'clones', COPY_A), 'a.txt', 'a\n')
    await call('branch.commit', { workspace, copyId: COPY_A, branch: 'add-login-page', message: 'a', author: AGENT, onBehalfOf: null, runId: 'r' })
    expect(await call('branch.delete', { workspace, branch: 'add-login-page', copyId: COPY_A })).toEqual({ deleted: true, lostCommits: 1 })
    expect(db.copies.size).toBe(0)
  })
})

describe('refusals', () => {
  it('a workspace this site does not hold, params it does not take, and a workspace without Git', async () => {
    const outside = await call('branch.list', { workspace: { ...workspace, workspaceId: 'nope' }, merged: [] }).catch((e: unknown) => e)
    expect((outside as RepoWorkError).code).toBe('outside')
    const bad = await call('git.readFile', { workspace, rev: { branch: 'main' }, path: '../etc/passwd' }).catch((e: unknown) => e)
    expect((bad as RepoWorkError).code).toBe('invalid')
    const option = await call('branch.changes', { workspace, branch: '--output=/tmp/x', base: null }).catch((e: unknown) => e)
    expect((option as RepoWorkError).code).toBe('invalid')
    const noGit = await call('branch.list', { workspace, merged: [] }).catch((e: unknown) => e)
    expect((noGit as BranchWorkError).code).toBe('not_repository')
    expect((noGit as Error).message).not.toContain(root)
    expect(await call('git.init', { workspace, author: AUTHOR })).toHaveProperty('version')
    const again = await call('git.init', { workspace, author: AUTHOR }).catch((e: unknown) => e)
    expect((again as BranchWorkError).code).toBe('already_repository')
  })

  it('pushing a workspace not connected to GitHub refuses, and never echoes the token', async () => {
    await call('git.init', { workspace, author: AUTHOR })
    const err = await call('git.pushMain', { workspace, token: 'ghs_secret' }).catch((e: unknown) => e)
    expect((err as RepoWorkError).code).toBe('invalid')
    expect((err as Error).message).not.toContain('ghs_secret')
  })
})
