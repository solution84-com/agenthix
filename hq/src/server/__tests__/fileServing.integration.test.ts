/**
 * The task-attachment route over a real HTTP server, against the real test
 * database and a real filesystem: who it serves, who it refuses, and what the
 * bytes arrive as. Each request carries the link HQ makes for the person
 * (adr-0114); the server stands at a bare address, so HQ serves files itself,
 * as downloads (files/__tests__/fileAccess.test.ts covers the files origin).
 *
 * Real: Express routing, the status and headers a client receives, the
 * handler, project membership against real projects, members and tasks, path
 * resolution, and task attachments' bytes on disk in a temporary
 * HQ_STORAGE_ROOT. Stand-in: a token names a person, for whom the link is made.
 * An artefact has no route: it is read through the storage queries.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import { prisma } from '../../test/db'
import { createProject, createUser, createTestTask } from '../../test/factories'

const h = vi.hoisted(() => ({ sessions: new Map<string, string>() }))

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('wasp/auth/session', () => ({
  getSessionAndUserFromSessionId: async (token: string) => {
    const userId = h.sessions.get(token)
    return userId ? { session: { id: token }, user: { id: userId } } : null
  },
}))

import { getTaskFile } from '../fileServingHandlers'
import { decodePath, makeLink } from '../files/fileLinks'

const UUID = 'a1b2c3d4'
const PDF_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0xff, 0xfe, 0x00, 0x80])
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x10])

let sandbox: string
let server: http.Server
let baseUrl: string
const savedRoot = process.env.HQ_STORAGE_ROOT
const savedServerUrl = process.env.WASP_SERVER_URL

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-files-'))
  process.env.HQ_STORAGE_ROOT = path.join(sandbox, 'hq-storage')
  const app = express()
  app.get('/files/task/:taskId/:uuid/*path', getTaskFile)
  server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  process.env.WASP_SERVER_URL = baseUrl
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (savedRoot === undefined) delete process.env.HQ_STORAGE_ROOT
  else process.env.HQ_STORAGE_ROOT = savedRoot
  if (savedServerUrl === undefined) delete process.env.WASP_SERVER_URL
  else process.env.WASP_SERVER_URL = savedServerUrl
  await fs.rm(sandbox, { recursive: true, force: true })
})

/** A private project with one member and one outsider, each signed in under their own token. */
let projectId: string
beforeEach(async () => {
  h.sessions.clear()
  const member = await createUser()
  const outsider = await createUser()
  projectId = (await createProject({ accessLevel: 'PRIVATE' })).id
  await prisma.projectMember.create({ data: { projectId, userId: member.id } })
  h.sessions.set('member-token', member.id)
  h.sessions.set('outsider-token', outsider.id)
})

/** The file, through a link made for the person the token names; with no such person, with no link at all. */
function get(p: string, token?: string) {
  const userId = token ? h.sessions.get(token) : undefined
  if (!userId) return fetch(`${baseUrl}${p}`)
  return fetch(makeLink(baseUrl, { path: decodePath(p)!, userId, download: false }, new Date()).url)
}

describe('serving a task attachment', () => {
  let taskId: string
  beforeEach(async () => {
    const task = await createTestTask({ data: { title: 't', projectId, number: 1, onBehalfOfUserId: 'someone' } })
    taskId = task.id
    const dir = path.join(sandbox, 'hq-storage', 'tasks', taskId, UUID)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, 'notes.pdf'), PDF_BYTES)
    await fs.writeFile(path.join(dir, 'diagram.png'), PNG_BYTES)
    await fs.writeFile(path.join(dir, 'app.json'), '{"id":"app-1"}')
    await fs.writeFile(path.join(dir, 'report.html'), '<script>alert(1)</script>')
  })

  it('refuses a request with no link (403)', async () => {
    expect((await get(`/files/task/${taskId}/${UUID}/notes.pdf`)).status).toBe(403)
  })

  it("refuses a signed-in person who is not entitled to the task's project, saying nothing of whether the file is there (403)", async () => {
    const present = await get(`/files/task/${taskId}/${UUID}/notes.pdf`, 'outsider-token')
    const absent = await get(`/files/task/${taskId}/${UUID}/no-such-file.pdf`, 'outsider-token')
    expect(present.status).toBe(403)
    expect(Buffer.from(await present.arrayBuffer()).includes(PDF_BYTES)).toBe(false)
    expect(absent.status).toBe(403)
  })

  it("serves a member of the task's project the bytes unchanged, typed from the extension", async () => {
    const pdf = await get(`/files/task/${taskId}/${UUID}/notes.pdf`, 'member-token')
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('content-type')).toBe('application/pdf')
    expect(Buffer.from(await pdf.arrayBuffer()).equals(PDF_BYTES)).toBe(true)

    const png = await get(`/files/task/${taskId}/${UUID}/diagram.png`, 'member-token')
    expect(png.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await png.arrayBuffer()).equals(PNG_BYTES)).toBe(true)

    const json = await get(`/files/task/${taskId}/${UUID}/app.json`, 'member-token')
    expect(json.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(await json.text()).toBe('{"id":"app-1"}')
  })

  it('serves an unmapped type as an opaque download, never as inline text', async () => {
    const res = await get(`/files/task/${taskId}/${UUID}/report.html`, 'member-token')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="report.html"/)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe('sandbox')
  })

  it('answers 404 for a task that does not exist, a file that does not, and a path that climbs out', async () => {
    expect((await get(`/files/task/missing/${UUID}/notes.pdf`, 'member-token')).status).toBe(404)
    expect((await get(`/files/task/${taskId}/${UUID}/nope.pdf`, 'member-token')).status).toBe(404)
    expect((await get(`/files/task/${taskId}/${UUID}/..%2F..%2Fsecret.json`, 'member-token')).status).toBe(404)
  })
})
