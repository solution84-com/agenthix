/**
 * attach_file against the real test database and a real storage folder: who
 * may attach to a task (its project's entitlement), and that a file name is
 * one plain name — never a path out of the task's folder — and that the result
 * carries no URL or path. A refusal writes nothing, on disk or in the table.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import { attachFileOp } from '../taskOps'
import { ControlPlaneError } from '../types'
import { seedWorld, chatCtx, runCtx, connCtx, expectForbidden, type World } from './controlPlaneFixtures'

const saved = { hqStorageRoot: process.env.HQ_STORAGE_ROOT, serverUrl: process.env.WASP_SERVER_URL }
let root: string
const restoreEnv = (key: 'HQ_STORAGE_ROOT' | 'WASP_SERVER_URL', value: string | undefined) => {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'attach-file-'))
  process.env.HQ_STORAGE_ROOT = root
  process.env.WASP_SERVER_URL = 'https://hq.example'
})
afterAll(async () => {
  restoreEnv('HQ_STORAGE_ROOT', saved.hqStorageRoot)
  restoreEnv('WASP_SERVER_URL', saved.serverUrl)
  await fs.rm(root, { recursive: true, force: true })
})

let w: World
beforeEach(async () => {
  await fs.rm(path.join(root, 'tasks'), { recursive: true, force: true })
  w = await seedWorld()
})

const attach = (ctx: Parameters<typeof attachFileOp>[0], filename = 'notes.md', content = 'hello') =>
  attachFileOp(ctx, { taskId: w.task.id, filename, content })
async function nothingWritten() {
  expect(await fs.readdir(root)).toEqual([])
  expect(await prisma.taskAttachment.count()).toBe(0)
}

describe('attach_file — project entitlement', () => {
  it("accepts one from a chat caller who is a member of the task's project, storing the bytes and the row", async () => {
    const result = await attach(chatCtx(w.member.id))
    expect(result.success).toBe(true)
    const [uuid] = await fs.readdir(path.join(root, 'tasks', w.task.id))
    expect(await fs.readFile(path.join(root, 'tasks', w.task.id, uuid, 'notes.md'), 'utf8')).toBe('hello')
    expect(await prisma.taskAttachment.findFirstOrThrow()).toMatchObject({ taskId: w.task.id, uuid, fileName: 'notes.md' })
  })

  // A refusal that still wrote the bytes would be no refusal at all.
  it("refuses a chat caller who is not entitled to the task's project, and writes nothing", async () => {
    await expectForbidden(attach(chatCtx(w.outsider.id)))
    await nothingWritten()
  })

  it('refuses an unattended run confined to another project, and writes nothing', async () => {
    await expectForbidden(attach(runCtx('another-project', { userId: w.member.id })))
    await nothingWritten()
  })

  it("accepts one from a member's connection, and refuses a non-member's — an admin's included (adr-0090)", async () => {
    expect((await attach(connCtx(w.member.id))).success).toBe(true)
    await expectForbidden(attach(connCtx(w.outsider.id, { role: 'ADMIN' }), 'x.md', 'x'))
    expect(await prisma.taskAttachment.count()).toBe(1)
  })

  it('404s an unknown task before any filesystem write', async () => {
    const attempt = attachFileOp(runCtx(w.project.id), { taskId: 'no-such-task', filename: 'notes.md', content: 'hello' })
    await expect(attempt).rejects.toMatchObject({ code: 'not_found' })
    await nothingWritten()
  })
})

describe('attach_file — file name', () => {
  const UNSAFE = ['../../escape.md', 'nested/notes.md', 'nested\\notes.md', '..', '.', '', 'bad\u0000.md', 'line\nbreak.md', 'x'.repeat(256)]

  it.each(UNSAFE)('refuses %j as invalid and writes nothing', async (filename) => {
    const attempt = attach(runCtx(w.project.id), filename)
    await expect(attempt).rejects.toBeInstanceOf(ControlPlaneError)
    await expect(attempt).rejects.toMatchObject({ code: 'invalid' })
    await nothingWritten()
  })

  it('stores a plain name as given and returns only the attachment id and file name — no URL, no path', async () => {
    const result = await attach(runCtx(w.project.id), 'notes v2.md')
    const [uuid] = await fs.readdir(path.join(root, 'tasks', w.task.id))
    expect(await fs.readFile(path.join(root, 'tasks', w.task.id, uuid, 'notes v2.md'), 'utf8')).toBe('hello')
    const row = await prisma.taskAttachment.findFirstOrThrow()
    expect(row).toMatchObject({ uuid, fileName: 'notes v2.md' })
    expect(result).toEqual({ success: true, attachmentId: row.id, fileName: 'notes v2.md' })
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain('hq.example')
  })
})
