/**
 * A run on a branch's copy: checked against the site's record before it starts, swept while it goes, its leftovers
 * committed as *Work in progress* at its end, and anything not back brought back when the site starts again. Each
 * move of the branch is told to hq as `branch.back`.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReadableRunError } from '../../../agents/runtime/readableRunError'

const db = vi.hoisted(() => {
  const copies = new Map<string, Record<string, unknown>>()
  return {
    copies,
    prisma: {
      workspace: { findFirst: async ({ where }: { where: { id: string } }) => (where.id === 'w1' ? { id: 'w1' } : null) },
      branchCopy: {
        findUnique: async ({ where }: { where: { id: string } }) => copies.get(where.id) ?? null,
        findMany: async () => [...copies.values()].filter(c => c.backPending),
        create: async ({ data }: { data: Record<string, unknown> }) => { copies.set(String(data.id), { ...data, backPending: false }); return data },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(copies.get(where.id)!, data),
        updateMany: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const c = copies.get(where.id)
          if (c) Object.assign(c, data)
          return { count: c ? 1 : 0 }
        },
      },
    },
  }
})
const sent = vi.hoisted(() => [] as { event: string; data: Record<string, unknown> }[])
vi.mock('#db', () => ({ prisma: db.prisma }))
vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: { sendEvent: (event: string, data: Record<string, unknown>) => sent.push({ event, data }) } }))

import { branchCreate } from '../branchWorkMethods'
import { gitInit } from '../mainWorkMethods'
import { bringBackPending, endCodeWork, resetCodeWorkRuns, resolveCodeWork, startCodeWork } from '../codeWorkRun'
import { AUTHOR, COPY_A, sh, write } from './gitFixture'

let root: string
const workspace = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' }
const author = { name: 'Kernel', email: 'kernel@agents.hq.example' }
const person = { name: 'Mia', email: 'mia@people.hq.example' }
const codeWork = { workspace, copyId: COPY_A, branch: 'add-login-page', main: 'main', behindMain: 0, otherBranches: [], author, onBehalfOf: person }
const boundary = { ownerType: 'project', ownerId: 'p1' }
const ws = () => path.join(root, 'projects', 'p1', 'workspaces', 'w1')
const copy = () => path.join(root, 'projects', 'p1', 'clones', COPY_A)

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'code-work-run-'))
  process.env.SITE_ROOT = root
  delete process.env.AGENT_CONTAINER_ISOLATION
  db.copies.clear()
  sent.length = 0
  write(ws(), 'README.md', 'hello\n')
  await gitInit({ workspace, author: AUTHOR })
  await branchCreate({ workspace, copyId: COPY_A, branch: 'add-login-page' })
})
afterEach(() => {
  resetCodeWorkRuns()
  vi.useRealTimers()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('a run on a branch\'s copy', () => {
  it('starts only on a copy the site\'s record says is this workspace\'s copy of this branch, in this storage @SC-1724', async () => {
    await expect(resolveCodeWork('r', { ...codeWork, branch: 'signup' }, boundary)).rejects.toBeInstanceOf(ReadableRunError)
    await expect(resolveCodeWork('r', codeWork, { ownerType: 'project', ownerId: 'other' })).rejects.toBeInstanceOf(ReadableRunError)
    await expect(resolveCodeWork('r', { ...codeWork, copyId: '33333333-3333-4333-8333-333333333333' }, boundary)).rejects.toBeInstanceOf(ReadableRunError)
    const run = await resolveCodeWork('r', codeWork, boundary)
    expect(run).toMatchObject({ copyDir: copy(), branch: 'add-login-page', author, onBehalfOf: person })
  })

  it('at its end commits what was left as Work in progress, brings the branch back and tells hq @SC-1725', async () => {
    const run = await resolveCodeWork('run-1', codeWork, boundary)
    await startCodeWork(run)
    expect(db.copies.get(COPY_A)?.backPending).toBe(true)
    write(copy(), 'half.txt', 'half done\n')
    await endCodeWork(run)
    // Named as hq names the agent's own commits: the agent as author, the person in an On-behalf-of line.
    expect(sh(ws(), ['log', '-1', '--format=%an|%ae|%s', 'add-login-page'])).toBe('Kernel|kernel@agents.hq.example|Work in progress')
    expect(sh(ws(), ['log', '-1', '--format=%b', 'add-login-page'])).toContain('On-behalf-of: Mia <mia@people.hq.example>')
    expect(sent).toEqual([expect.objectContaining({ event: 'branch.back', data: expect.objectContaining({ cause: 'run_end', runId: 'run-1', branch: 'add-login-page', back: expect.objectContaining({ moved: true }) }) })])
    expect(db.copies.get(COPY_A)?.backPending).toBe(false)
  })

  it('brings back what the agent committed with its own git on the sweep while it goes @SC-1725', async () => {
    const run = await resolveCodeWork('run-2', codeWork, boundary)
    await startCodeWork(run, 50)
    write(copy(), 'a.txt', 'a\n')
    sh(copy(), ['add', '-A']); sh(copy(), ['commit', '-qm', 'by its own git'])
    const tip = sh(copy(), ['rev-parse', 'HEAD'])
    await vi.waitFor(() => expect(sh(ws(), ['rev-parse', 'add-login-page'])).toBe(tip), { timeout: 10_000, interval: 100 })
    await vi.waitFor(() => expect(sent.some(s => s.data.cause === 'sweep')).toBe(true))
    await endCodeWork(run)
    expect(sent.filter(s => s.data.cause === 'run_end')).toEqual([])
  })

  it('after a start of the site, brings back every copy still marked @SC-1725', async () => {
    write(copy(), 'a.txt', 'a\n')
    sh(copy(), ['add', '-A']); sh(copy(), ['commit', '-qm', 'before the site stopped'])
    db.copies.get(COPY_A)!.backPending = true
    expect(await bringBackPending()).toBe(1)
    expect(sh(ws(), ['rev-parse', 'add-login-page'])).toBe(sh(copy(), ['rev-parse', 'HEAD']))
    expect(sent[0]).toMatchObject({ data: { cause: 'site_back', runId: null } })
    expect(db.copies.get(COPY_A)?.backPending).toBe(false)
  })
})
