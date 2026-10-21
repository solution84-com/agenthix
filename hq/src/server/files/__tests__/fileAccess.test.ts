/**
 * Uploaded files over a real HTTP server and a real filesystem (host-management spec §16, adr-0114): a link made
 * on HQ's own address for one person, served on the files origin alone, with the headers every file carries.
 *
 * Stubbed: Wasp's session lookup, the task row and project membership. Real: routing by Host header, the guard,
 * the link, the handlers and the bytes on disk.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'

const h = vi.hoisted(() => ({
  sessions: new Map([['alice-token', 'usr_alice'], ['bob-token', 'usr_bob']]),
  members: new Set(['usr_alice']),
}))

vi.mock('wasp/auth/session', () => ({
  getSessionAndUserFromSessionId: async (token: string) => {
    const id = h.sessions.get(token)
    return id ? { session: { id: token }, user: { id } } : null
  },
}))
vi.mock('wasp/server', () => ({
  prisma: { task: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'tsk_1' ? { id: 'tsk_1', projectId: 'prj_1' } : null) } },
}))
vi.mock('../../../projects/membership', () => ({
  requireProjectMember: async (_projectId: string, userId: string) => {
    if (!h.members.has(userId)) throw Object.assign(new Error('Not a member of this project'), { statusCode: 403 })
  },
}))

import { fileLinkHandler, filesHostGuard } from '../fileAccess'
import { getTaskFile, resolveSessionUserId } from '../../fileServingHandlers'
import { getAgentImage } from '../../imageHandlers'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])
const HTML = Buffer.from('<script>alert(document.domain)</script>')
let sandbox: string
let server: http.Server
let port: number
const saved = { ...process.env }

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-files-origin-'))
  process.env.HQ_STORAGE_ROOT = path.join(sandbox, 'hq-storage')
  process.env.JWT_SECRET = 'test-secret'
  delete process.env.FILES_ORIGIN
  const images = path.join(sandbox, 'hq-storage', 'agents', 'agt_1', 'images')
  const task = path.join(sandbox, 'hq-storage', 'tasks', 'tsk_1', 'u-1')
  await fs.mkdir(images, { recursive: true })
  await fs.mkdir(task, { recursive: true })
  await fs.writeFile(path.join(images, 'avatar.png'), PNG)
  await fs.writeFile(path.join(task, 'page.html'), HTML)
  await fs.writeFile(path.join(task, 'shot.png'), PNG)

  const app = express()
  app.use(filesHostGuard)
  app.get('/file-link', fileLinkHandler(resolveSessionUserId))
  app.get('/files/task/:taskId/:uuid/*path', getTaskFile)
  app.get('/agents/:agentId/images/:filename', getAgentImage)
  app.get('/operations/get-me', (_req, res) => { res.json({ me: true }) })
  server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port
  process.env.WASP_SERVER_URL = `http://localhost:${port}`
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  process.env = saved
  await fs.rm(sandbox, { recursive: true, force: true })
})

type Got = { status: number; headers: http.IncomingHttpHeaders; body: Buffer }

function get(pathAndQuery: string, host: string, headers: Record<string, string> = {}): Promise<Got> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathAndQuery, headers: { host, ...headers } }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}

const hq = () => `localhost:${port}`
const files = () => `files.localhost:${port}`

async function linkFor(filePath: string, token?: string, download = false): Promise<URL> {
  const q = new URLSearchParams({ path: filePath })
  if (download) q.set('download', '1')
  const res = await get(`/file-link?${q}`, hq(), token ? { authorization: `Bearer ${token}` } : {})
  expect(res.status).toBe(200)
  return new URL(JSON.parse(res.body.toString()).url)
}

const open = (link: URL, host = files()) => get(link.pathname + link.search, host)

describe('the files origin', () => {
  it("HQ makes a link on its own address, to the files origin", async () => {
    const link = await linkFor('/agents/agt_1/images/avatar.png', 'alice-token')
    expect(link.host).toBe(files())
  })

  it('serves the file to its link, with the headers every file carries', async () => {
    const res = await open(await linkFor('/agents/agt_1/images/avatar.png', 'alice-token'))
    expect(res.status).toBe(200)
    expect(res.body.equals(PNG)).toBe(true)
    expect(res.headers['content-security-policy']).toBe('sandbox')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-disposition']).toBe('inline')
    expect(res.headers['cache-control']).toContain('private')
  })

  it('sends a file of no shown type as a download, still sandboxed', async () => {
    const res = await open(await linkFor('/files/task/tsk_1/u-1/page.html', 'alice-token'))
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/octet-stream')
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="page.html"/)
    expect(res.headers['content-security-policy']).toBe('sandbox')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('sends a picture as a download when the link asked for one', async () => {
    const res = await open(await linkFor('/files/task/tsk_1/u-1/shot.png', 'alice-token', true))
    expect(res.headers['content-disposition']).toMatch(/^attachment;/)
  })

  it("no longer serves an upload on HQ's own address", async () => {
    const link = await linkFor('/agents/agt_1/images/avatar.png', 'alice-token')
    expect((await open(link, hq())).status).toBe(404)
  })

  it('refuses a link made for one person to another', async () => {
    // Bob may sign in but is not in the task's project: his own link is refused when it is opened.
    expect((await open(await linkFor('/files/task/tsk_1/u-1/shot.png', 'bob-token'))).status).toBe(403)
    // Alice's link, re-pointed at Bob, fails its signature.
    const alice = await linkFor('/files/task/tsk_1/u-1/shot.png', 'alice-token')
    alice.searchParams.set('u', 'usr_bob')
    expect((await open(alice)).status).toBe(403)
  })

  it('refuses a tampered link, and the same file with no link at all', async () => {
    const link = await linkFor('/agents/agt_1/images/avatar.png', 'alice-token')
    const other = new URL(link)
    other.pathname = '/agents/agt_2/images/avatar.png'
    expect((await open(other)).status).toBe(403)
    expect((await get('/agents/agt_1/images/avatar.png', files())).status).toBe(403)
  })

  it('refuses an expired link', async () => {
    const link = await linkFor('/agents/agt_1/images/avatar.png', 'alice-token')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.now() + 11 * 60_000))
    try {
      expect((await open(link)).status).toBe(410)
    } finally {
      vi.useRealTimers()
    }
  })

  it('makes no link without a session, except for a picture the sign-in page may show', async () => {
    expect((await get(`/file-link?path=${encodeURIComponent('/agents/agt_1/images/avatar.png')}`, hq())).status).toBe(401)
    expect((await get(`/file-link?path=${encodeURIComponent('/org/images/cover.png')}`, hq())).status).toBe(200)
    expect((await get(`/file-link?path=${encodeURIComponent('/operations/get-me')}`, hq(), { authorization: 'Bearer alice-token' })).status).toBe(404)
  })

  it("answers nothing of HQ's on the files origin, and never a session there", async () => {
    expect((await get('/operations/get-me', files(), { authorization: 'Bearer alice-token' })).status).toBe(404)
    expect((await get('/file-link?path=%2Fagents%2Fagt_1%2Fimages%2Favatar.png', files(), { authorization: 'Bearer alice-token' })).status).toBe(404)
    expect((await get('/operations/get-me', hq())).status).toBe(200)
  })
})

describe('with no host name for files', () => {
  it("serves from HQ's own address, every file a download", async () => {
    const before = process.env.WASP_SERVER_URL
    process.env.WASP_SERVER_URL = `http://127.0.0.1:${port}`
    try {
      const link = await linkFor('/agents/agt_1/images/avatar.png', 'alice-token')
      expect(link.host).toBe(`127.0.0.1:${port}`)
      const res = await open(link, `127.0.0.1:${port}`)
      expect(res.status).toBe(200)
      expect(res.headers['content-disposition']).toMatch(/^attachment;/)
      expect(res.headers['content-security-policy']).toBe('sandbox')
    } finally {
      process.env.WASP_SERVER_URL = before
    }
  })
})
