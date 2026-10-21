/**
 * Finding and listing tasks, and a task's attachments, against the real test DB
 * (SC-042, SC-043, SC-177, plan §8.3b). The attachment inventory and the bytes
 * both follow the project's visibility; a file name is stored only as one plain
 * name, never a path.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { prisma } from '../../test/db'
import { createProject, createUser, createUserWithRole } from '../../test/factories'
import { ctx, makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { uploadTaskAttachment } from '../actions'
import { getTasks, getAllTasks, getTaskByKey, getTaskAttachments } from '../queries'

const saved = { hqStorageRoot: process.env.HQ_STORAGE_ROOT, serverUrl: process.env.WASP_SERVER_URL }
let root: string
const dataUrl = (text = 'hello', mime = 'text/plain') => `data:${mime};base64,${Buffer.from(text).toString('base64')}`

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'task-reads-'))
  process.env.HQ_STORAGE_ROOT = root
  process.env.WASP_SERVER_URL = 'https://hq.example'
})
afterAll(async () => {
  for (const [key, value] of [['HQ_STORAGE_ROOT', saved.hqStorageRoot], ['WASP_SERVER_URL', saved.serverUrl]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await fs.rm(root, { recursive: true, force: true })
})
beforeEach(async () => {
  await fs.rm(path.join(root, 'tasks'), { recursive: true, force: true })
})

/** A new person who is a member of each of `projects` (membership is the only gate, adr-0099). */
async function memberOf(...projects: Array<{ id: string }>) {
  const user = await createUser()
  await prisma.projectMember.createMany({ data: projects.map(p => ({ projectId: p.id, userId: user.id })) })
  return user
}

describe('task browsing and filtering @SC-043', () => {
  it('getTasks returns only the given project, archived tasks only when asked', async () => {
    const a = await createProject()
    const b = await createProject()
    const reader = await memberOf(a)
    const keep = await makeTask(a.id)
    const archived = await makeTask(a.id, { archived: true })
    await makeTask(b.id)

    expect((await getTasks({ projectId: a.id }, ctx(reader))).map((r: { id: string }) => r.id)).toEqual([keep.id])
    expect((await getTasks({ projectId: a.id, includeArchived: true }, ctx(reader))).map((r: { id: string }) => r.id).sort())
      .toEqual([keep.id, archived.id].sort())
  })

  it('getAllTasks spans every project the reader may see, excluding archived by default', async () => {
    const a = await createProject()
    const b = await createProject()
    const reader = await memberOf(a, b)
    await makeTask(a.id)
    await makeTask(b.id)
    await makeTask(b.id, { archived: true })
    await makeTask((await createProject({ accessLevel: 'PRIVATE' })).id)

    expect(await getAllTasks({}, ctx(reader))).toHaveLength(2)
  })

  // F-013a: a 401, not a bare Error that Wasp surfaces as a 500.
  it('rejects a caller who is not signed in with 401', async () => {
    await expect(Promise.resolve(getTasks({ projectId: 'p' }, ctx(null)))).rejects.toMatchObject({ statusCode: 401 })
    await expect(Promise.resolve(getAllTasks({}, ctx(null)))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('getTaskByKey @SC-177', () => {
  it('resolves a well-formed KEY-NN to the matching task', async () => {
    const project = await createProject({ key: 'DASH' })
    const task = await makeTask(project.id, { number: 1 })
    expect(await getTaskByKey({ taskKey: 'DASH-1' }, ctx(await memberOf(project)))).toMatchObject({ id: task.id, taskKey: 'DASH-1' })
  })

  it('rejects a malformed key with 400, and a missing project or task number with 404', async () => {
    const reader = await memberOf(await createProject({ key: 'DASH' }))
    await expect(Promise.resolve(getTaskByKey({ taskKey: 'not a key' }, ctx(reader)))).rejects.toMatchObject({ statusCode: 400 })
    await expect(Promise.resolve(getTaskByKey({ taskKey: 'dash-1' }, ctx(reader)))).rejects.toMatchObject({ statusCode: 400 })
    await expect(Promise.resolve(getTaskByKey({ taskKey: 'ZZZ-1' }, ctx(reader)))).rejects.toMatchObject({ statusCode: 404 })
    await expect(Promise.resolve(getTaskByKey({ taskKey: 'DASH-99' }, ctx(reader)))).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe("a task's attachments follow its project's visibility (plan §8.3b)", () => {
  async function privateTask() {
    const member = await createUser()
    const outsider = await createUserWithRole('ADMIN')
    const project = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
    return { member, outsider, task: await makeTask(project.id) }
  }

  it('lists them for a member, and answers an outsider as a missing task — a refusal, not an empty list', async () => {
    const { member, outsider, task } = await privateTask()
    await uploadTaskAttachment({ taskId: task.id, filename: 'notes.md', dataUrl: dataUrl() }, ctx(member))

    expect((await getTaskAttachments({ taskId: task.id }, ctx(member))).map((a: { fileName: string }) => a.fileName)).toEqual(['notes.md'])
    await expect(Promise.resolve(getTaskAttachments({ taskId: task.id }, ctx(outsider)))).rejects.toMatchObject({ statusCode: 404, message: 'Task not found' })
    await expect(Promise.resolve(getTaskAttachments({ taskId: task.id }, ctx(null)))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('refuses an upload from an outsider, writing nothing on disk and no row', async () => {
    const { outsider, task } = await privateTask()
    await expect(uploadTaskAttachment({ taskId: task.id, filename: 'notes.md', dataUrl: dataUrl() }, ctx(outsider)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(await fs.readdir(root)).toEqual([])
    expect(await prisma.taskAttachment.count()).toBe(0)
  })
})

describe('uploadTaskAttachment @SC-042', () => {
  const UNSAFE = ['../../escape.md', 'nested/notes.md', 'nested\\notes.md', '..', '.', '', 'bad\u0000.md', 'line\nbreak.md', 'x'.repeat(256)]

  it.each(UNSAFE)('refuses the file name %j with 400 and writes nothing', async (filename) => {
    const project = await createProject()
    const task = await makeTask(project.id)
    await expect(uploadTaskAttachment({ taskId: task.id, filename, dataUrl: dataUrl() }, ctx(await memberOf(project))))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await fs.readdir(root)).toEqual([])
    expect(await prisma.taskAttachment.count()).toBe(0)
  })

  it('stores any-MIME file under an unguessable uuid, as the name given, and returns a share-by-link url encoding it', async () => {
    const project = await createProject()
    const task = await makeTask(project.id)

    const res = await uploadTaskAttachment(
      { taskId: task.id, filename: 'notes v2.bin', dataUrl: dataUrl('hello', 'application/octet-stream'), label: 'draft' }, ctx(await memberOf(project)),
    )

    const row = await prisma.taskAttachment.findUniqueOrThrow({ where: { id: res.attachmentId } })
    expect(row).toMatchObject({ fileName: 'notes v2.bin', mimeType: 'application/octet-stream', fileSizeBytes: 5, label: 'draft' })
    expect(res.url).toBe(`https://hq.example/files/task/${task.id}/${row.uuid}/notes%20v2.bin`)
    expect(await fs.readFile(path.join(root, 'tasks', task.id, row.uuid, 'notes v2.bin'), 'utf8')).toBe('hello')
  })

  it('rejects a file larger than 10 MB with 400 and creates no attachment', async () => {
    const project = await createProject()
    const task = await makeTask(project.id)
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61)
    await expect(uploadTaskAttachment(
      { taskId: task.id, filename: 'big.bin', dataUrl: `data:application/octet-stream;base64,${big.toString('base64')}` }, ctx(await memberOf(project)),
    )).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.taskAttachment.count()).toBe(0)
  })
})
