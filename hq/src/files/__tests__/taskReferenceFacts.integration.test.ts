/**
 * What chips naming a task or its attachment are told (spec part 3, *Chips in conversations › Tasks and their files*),
 * against the real test database and a real filesystem: a member gets the task's key, title and status by its key or
 * id, and an attachment's facts by its name; an outsider and a task that doesn't exist get the same `not-found`, never
 * the title; nothing is signed and nothing is recorded.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { prisma } from '../../test/db'
import { createProject, createTestTask, createUser, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma, config: { allowedCORSOrigins: [] } }
})

import { getTaskReferenceFactsQuery } from '../operations'

let sandbox: string
const saved = process.env.HQ_STORAGE_ROOT

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-task-chips-'))
  process.env.HQ_STORAGE_ROOT = path.join(sandbox, 'storage')
})
afterAll(async () => {
  if (saved === undefined) delete process.env.HQ_STORAGE_ROOT
  else process.env.HQ_STORAGE_ROOT = saved
  await fs.rm(sandbox, { recursive: true, force: true })
})

type World = { member: string; outsider: string; key: string; taskId: string; attachmentId: string }
let w: World

beforeEach(async () => {
  const member = await createUser()
  const outsider = await createUser()
  const project = await createProject({ accessLevel: 'PRIVATE' })
  await joinProjectAs(project.id, member.id)
  const task = await createTestTask({ data: { title: 'Fix the sign-up form', projectId: project.id, number: 7, state: 'IN_PROGRESS', onBehalfOfUserId: member.id } })
  const file = path.join(sandbox, 'storage', 'tasks', task.id, 'u-1', 'shot one.png')
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]))
  const attachment = await prisma.taskAttachment.create({ data: { taskId: task.id, uuid: 'u-1', fileName: 'shot one.png' } })
  w = { member: member.id, outsider: outsider.id, key: `${project.key}-7`, taskId: task.id, attachmentId: attachment.id }
})

const ask = (userId: string, references: string[]) =>
  getTaskReferenceFactsQuery({ references }, { user: { id: userId } }).then(r => r.answers)

describe('task chip facts @SC-1517', () => {
  it("tells a member the task's key, title and status, by its key or its id", async () => {
    const task = { id: w.taskId, key: w.key, title: 'Fix the sign-up form', state: 'IN_PROGRESS' }
    expect(await ask(w.member, [`tasks/${w.key}`, `tasks/${w.taskId}`])).toEqual([{ state: 'task', task }, { state: 'task', task }])
  })

  it("tells a member an attachment's facts by its name, with its id for the click", async () => {
    const [answer] = await ask(w.member, [`attachments/${w.key}/shot one.png`])
    expect(answer).toMatchObject({
      state: 'attachment', attachmentId: w.attachmentId, task: { key: w.key },
      file: { state: 'ready', facts: { name: 'shot one.png', size: 7, kind: 'image' } },
    })
  })

  it('answers an attachment the task has no file by that name as gone, in a task the person can see', async () => {
    const [answer] = await ask(w.member, [`attachments/${w.key}/other.png`])
    expect(answer).toMatchObject({ state: 'attachment', attachmentId: null, file: { state: 'gone' } })
  })

  it('answers an outsider not-found for the task and its files, as for a task that does not exist: never the title', async () => {
    const answers = await ask(w.outsider, [`tasks/${w.key}`, `attachments/${w.key}/shot one.png`, `tasks/${w.key}/notes.md`, 'tasks/ZZZZ-1'])
    expect(answers).toEqual([{ state: 'not-found' }, { state: 'not-found' }, { state: 'not-found' }, { state: 'not-found' }])
    expect(JSON.stringify(answers)).not.toContain('sign-up')
  })

  it('signs nothing and records nothing', async () => {
    await ask(w.member, [`tasks/${w.key}`, `attachments/${w.key}/shot one.png`])
    expect(await prisma.fileOpened.count()).toBe(0)
  })

  it('refuses what is not a task reference, and too many at once', async () => {
    await expect(ask(w.member, ['files/a.md'])).rejects.toMatchObject({ statusCode: 400 })
    await expect(ask(w.member, Array.from({ length: 51 }, () => `tasks/${w.key}`))).rejects.toMatchObject({ statusCode: 400 })
  })
})
