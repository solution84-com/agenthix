import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getTaskAttachmentDir } from '../../server/hqStoragePaths'
import { removeTaskAttachmentFolders } from '../taskAttachmentFiles'

let root: string
const saved = process.env.HQ_STORAGE_ROOT

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'task-attachments-'))
  process.env.HQ_STORAGE_ROOT = root
})
afterEach(async () => {
  if (saved === undefined) delete process.env.HQ_STORAGE_ROOT
  else process.env.HQ_STORAGE_ROOT = saved
  await fs.rm(root, { recursive: true, force: true })
})

async function attach(taskId: string, uuid: string) {
  const dir = getTaskAttachmentDir(taskId, uuid)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'notes.txt'), 'x')
}

describe('a deleted task takes its attachment files with it (F-hq-6-05)', () => {
  it('removes every attachment of the named tasks, and only those', async () => {
    await attach('t1', 'a'); await attach('t1', 'b'); await attach('t2', 'c'); await attach('t3', 'd')

    await removeTaskAttachmentFolders(['t1', 't2'])

    expect(await fs.readdir(path.join(root, 'tasks'))).toEqual(['t3'])
  })

  it('does not fail for a task that never had an attachment', async () => {
    await expect(removeTaskAttachmentFolders(['never'])).resolves.toBeUndefined()
  })
})
