/**
 * Who may open which upload, decided before hq signs its ticket (adr-0153), over a real filesystem. Stubbed: the task
 * row, the organisation's row and project membership (the integration test has them for real).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileVersion } from '@agenthix/core'

const h = vi.hoisted(() => ({
  members: new Set(['usr_alice']),
  org: { avatarUrl: '/org/images/a.png', coverUrl: null as string | null, signInShows: 'COVER' },
}))

vi.mock('wasp/server', () => ({
  prisma: {
    task: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'tsk_1' ? { projectId: 'prj_1' } : null) },
    org: { findFirst: async () => h.org },
  },
}))
vi.mock('../../../projects/membership', () => ({
  requireProjectMember: async (_projectId: string, userId: string) => {
    if (!h.members.has(userId)) throw Object.assign(new Error('Not a member of this project'), { statusCode: 403 })
  },
}))

import { uploadAccess } from '../uploadAccess'

const TEAM = '0f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a'
let sandbox: string
let storage: string
const saved = process.env.HQ_STORAGE_ROOT

async function put(rel: string, content = 'x') {
  const file = path.join(storage, rel)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content)
  return file
}

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-upload-access-'))
  storage = path.join(sandbox, 'storage')
  process.env.HQ_STORAGE_ROOT = storage
  await put('tasks/tsk_1/u-1/notes v2.pdf', 'PDF-BYTES')
  await put('agents/agt_1/images/avatar.png')
  await put('people/usr_bob/images/me.webp')
  await put('org/images/a.png')
  await put('org/images/old.png')
  await put(`teams/${TEAM}/images/t.jpg`)
  await put('models/registry.json')
  await fs.mkdir(path.join(storage, 'agents/agt_1/images/folder.png'), { recursive: true })
  await fs.writeFile(path.join(sandbox, 'secret.png'), 'SECRET')
  await fs.symlink(path.join(sandbox, 'secret.png'), path.join(storage, 'agents/agt_1/images/out.png'))
  await fs.symlink(path.join(storage, 'agents/agt_1/images/avatar.png'), path.join(storage, 'agents/agt_1/images/in.png'))
  await fs.mkdir(path.join(sandbox, 'outside', 'images'), { recursive: true })
  await fs.writeFile(path.join(sandbox, 'outside', 'images', 'secret.png'), 'SECRET')
  await fs.symlink(path.join(sandbox, 'outside'), path.join(storage, 'people/usr_link'))
})

afterAll(async () => {
  if (saved === undefined) delete process.env.HQ_STORAGE_ROOT
  else process.env.HQ_STORAGE_ROOT = saved
  await fs.rm(sandbox, { recursive: true, force: true })
})

const status = async (p: string, user: string | null) => {
  const access = await uploadAccess(p, user)
  return access.ok ? 200 : access.status
}

describe('a task attachment @SC-1520', () => {
  it("opens to a member of the task's project, with the stat its ticket's version is made from", async () => {
    const access = await uploadAccess('/files/task/tsk_1/u-1/notes v2.pdf', 'usr_alice')
    expect(access.ok).toBe(true)
    const stat = await fs.stat(path.join(storage, 'tasks/tsk_1/u-1/notes v2.pdf'))
    expect(access.ok && fileVersion(access.stat.size, access.stat.mtimeMs)).toBe(fileVersion(stat.size, stat.mtimeMs))
  })

  it('refuses someone outside the project the same way whether the file is there or not', async () => {
    expect(await status('/files/task/tsk_1/u-1/notes v2.pdf', 'usr_bob')).toBe(404)
    expect(await status('/files/task/tsk_1/u-1/none.pdf', 'usr_bob')).toBe(404)
  })

  it('refuses without a session, for a task that is not there, and for a file that is not', async () => {
    expect(await status('/files/task/tsk_1/u-1/notes v2.pdf', null)).toBe(401)
    expect(await status('/files/task/tsk_9/u-1/notes v2.pdf', 'usr_alice')).toBe(404)
    expect(await status('/files/task/tsk_1/u-1/none.pdf', 'usr_alice')).toBe(404)
  })
})

describe("pictures @SC-1520", () => {
  it("opens an agent's, a person's and a team's to anyone signed in, and to no one signed out", async () => {
    for (const p of ['/agents/agt_1/images/avatar.png', '/people/usr_bob/images/me.webp', `/teams/${TEAM}/images/t.jpg`]) {
      expect(await status(p, 'usr_bob')).toBe(200)
      expect(await status(p, null)).toBe(401)
    }
  })

  it("opens the organisation's to anyone signed in; signed out, only the current ones while the sign-in page shows the cover", async () => {
    expect(await status('/org/images/old.png', 'usr_bob')).toBe(200)
    expect(await status('/org/images/a.png', null)).toBe(200)
    expect(await status('/org/images/old.png', null)).toBe(401)
    h.org.signInShows = 'NAME'
    try {
      expect(await status('/org/images/a.png', null)).toBe(401)
    } finally {
      h.org.signInShows = 'COVER'
    }
  })

  it('refuses a name hq never writes, and a team that is not a team id', async () => {
    expect(await status('/agents/agt_1/images/avatar.svg', 'usr_bob')).toBe(404)
    expect(await status('/teams/not-a-team/images/t.jpg', 'usr_bob')).toBe(404)
  })
})

describe('the file on disk @SC-1520', () => {
  it('refuses a link, out of the storage folder or inside it, a folder, and a link on the way', async () => {
    expect(await status('/agents/agt_1/images/out.png', 'usr_bob')).toBe(404)
    expect(await status('/agents/agt_1/images/in.png', 'usr_bob')).toBe(404)
    expect(await status('/agents/agt_1/images/folder.png', 'usr_bob')).toBe(404)
    expect(await status('/people/usr_link/images/secret.png', 'usr_bob')).toBe(404)
  })

  it('refuses any path that is not an upload, or steps out of its folder', async () => {
    for (const p of ['/models/registry.json', '/files/task/tsk_1/../../models/registry.json', '/files/task/tsk_1/u-1/..', 'agents/agt_1/images/avatar.png']) {
      expect(await status(p, 'usr_alice')).toBe(404)
    }
  })
})
