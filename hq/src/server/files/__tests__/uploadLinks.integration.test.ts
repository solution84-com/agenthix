/**
 * hq's uploads through hq's relay (spec part 1, *hq's relay*; T2, T9, T11; V5's hq half), against the real test
 * database and a real filesystem: every kind of upload gets a link to hq's relay for someone allowed and none for
 * someone not, each ticket signed is recorded, and hq-server answers no upload path with its bytes.
 *
 * Real: the route as hq-server registers it, access against real projects, members, tasks, the organisation and
 * teams, hq's relay's row and the `FileOpened` records. Stand-ins: a token names a person, the signing key, and the
 * relay's link to hq (marked connected, as the open action's test does).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import type { WebSocket } from 'ws'
import { generateKeyPair, exportJWK, calculateJwkThumbprint, type CryptoKey } from 'jose'
import { verifyRelayToken, fileVersion, FILE_TICKET_TOKEN_TYPE, type JsonWebKeySet } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createProject, createTestTask, createUser, joinProjectAs } from '../../../test/factories'

const h = vi.hoisted(() => ({
  sessions: new Map<string, string>(),
  keys: { kid: '', key: null as unknown, jwks: { keys: [] } as { keys: unknown[] } },
}))

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const { prisma } = await import('../../../test/db')
  // The suite aliases wasp/server to a stand-in without `config`, which hqCors reads.
  return { ...actual, prisma, config: { allowedCORSOrigins: [] } }
})
vi.mock('wasp/auth/session', () => ({
  getSessionAndUserFromSessionId: async (token: string) => {
    const id = h.sessions.get(token)
    return id ? { session: { id: token }, user: { id } } : null
  },
}))
vi.mock('../../identity/signingKeyService', () => ({
  SIGNING_ALG: 'RS256',
  getSigningKey: async () => ({ kid: h.keys.kid, key: h.keys.key }),
}))

import { registerUploadLinkRoute } from '../uploadLinkDeps'
import { relayLinks } from '../../../relays'

const PDF = Buffer.from('%PDF-1.7 not much of one')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])
const fakeLink = { close() {} } as unknown as WebSocket

let sandbox: string
let server: http.Server
let base: string
const saved = { root: process.env.HQ_STORAGE_ROOT, files: process.env.FILES_ORIGIN, client: process.env.WASP_WEB_CLIENT_URL }

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(pair.publicKey)
  h.keys.kid = await calculateJwkThumbprint(jwk)
  h.keys.key = pair.privateKey as CryptoKey
  h.keys.jwks = { keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid: h.keys.kid, alg: 'RS256', use: 'sig' }] }

  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-upload-links-'))
  process.env.HQ_STORAGE_ROOT = path.join(sandbox, 'storage')
  process.env.FILES_ORIGIN = 'https://files.example.com'
  process.env.WASP_WEB_CLIENT_URL = 'https://hq.example.com'
  const app = express()
  registerUploadLinkRoute(app)
  server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()))
  for (const [key, value] of [['HQ_STORAGE_ROOT', saved.root], ['FILES_ORIGIN', saved.files], ['WASP_WEB_CLIENT_URL', saved.client]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  if (sandbox) await fs.rm(sandbox, { recursive: true, force: true })
})

async function put(rel: string, bytes: Buffer) {
  const file = path.join(sandbox, 'storage', rel)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, bytes)
  const stat = await fs.stat(file)
  return fileVersion(stat.size, stat.mtimeMs)
}

type World = { relayId: string; member: string; outsider: string; paths: Record<string, string>; versions: Record<string, string> }
let world: World

beforeEach(async () => {
  h.sessions.clear()
  const relay = await prisma.relay.create({ data: { name: 'hq-box', isHq: true, credentialHash: 'c'.repeat(64), state: 'ON' } })
  relayLinks.add(relay.id, fakeLink)
  const member = await createUser()
  const outsider = await createUser()
  const project = await createProject({ accessLevel: 'PRIVATE' })
  await joinProjectAs(project.id, member.id)
  const task = await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: member.id } })
  const team = await prisma.team.create({ data: { name: 'Marketing' } })
  await prisma.org.create({ data: { name: 'Acme', coverUrl: '/org/images/cover.png', signInShows: 'COVER' } })
  h.sessions.set('member-token', member.id)
  h.sessions.set('outsider-token', outsider.id)
  const paths = {
    task: `/files/task/${task.id}/u-1/notes v2.pdf`,
    agent: '/agents/agt_1/images/avatar.png',
    person: `/people/${member.id}/images/me.png`,
    org: '/org/images/cover.png',
    team: `/teams/${team.id}/images/team.png`,
  }
  const versions = {
    task: await put(`tasks/${task.id}/u-1/notes v2.pdf`, PDF),
    agent: await put('agents/agt_1/images/avatar.png', PNG),
    person: await put(`people/${member.id}/images/me.png`, PNG),
    org: await put('org/images/cover.png', PNG),
    team: await put(`teams/${team.id}/images/team.png`, PNG),
  }
  await put('org/images/old.png', PNG)
  world = { relayId: relay.id, member: member.id, outsider: outsider.id, paths, versions }
})

afterEach(async () => {
  for (const r of await prisma.relay.findMany()) relayLinks.remove(r.id, fakeLink)
  await fs.rm(path.join(sandbox, 'storage'), { recursive: true, force: true })
})

const encode = (p: string) => p.split('/').map(encodeURIComponent).join('/')

async function linkFor(uploadPath: string, token?: string, download = false, small = false) {
  const q = new URLSearchParams({ path: encode(uploadPath) })
  if (download) q.set('download', '1')
  if (small) q.set('size', 'small')
  const res = await fetch(`${base}/file-link?${q}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
  return { status: res.status, body: await res.json() as { url?: string; error?: string } }
}

async function claimsOf(url: string) {
  const prefix = 'https://files.example.com/t/'
  expect(url.startsWith(prefix)).toBe(true)
  const verdict = await verifyRelayToken(url.slice(prefix.length), {
    type: FILE_TICKET_TOKEN_TYPE, keys: h.keys.jwks as unknown as JsonWebKeySet, audience: world.relayId,
    relay: world.relayId, nowMs: Date.now(), spaces: ['upload'],
  })
  expect(verdict.ok).toBe(true)
  return verdict.ok ? verdict.claims : null
}

describe("an upload's link @SC-1518", () => {
  it("is to hq's relay for someone allowed, for every kind, at the file's version, and each ticket is recorded", async () => {
    for (const kind of ['task', 'agent', 'person', 'org', 'team'] as const) {
      const res = await linkFor(world.paths[kind], 'member-token', kind === 'task')
      expect(res.status, kind).toBe(200)
      expect(await claimsOf(res.body.url!), kind).toMatchObject({
        space: 'upload', path: world.paths[kind], person: world.member, version: world.versions[kind],
        purpose: kind === 'task' ? 'download' : 'preview',
      })
    }
    const rows = await prisma.fileOpened.findMany({ orderBy: { openedAt: 'asc' } })
    expect(rows.map(r => r.path)).toEqual(Object.values(world.paths))
    expect(rows[0]).toMatchObject({ space: 'upload', personId: world.member, relayId: world.relayId, siteId: null, purpose: 'download', version: world.versions.task })
  })

  it("is none for someone outside the task's project, whether the file is there or not, and records nothing", async () => {
    expect((await linkFor(world.paths.task, 'outsider-token')).status).toBe(404)
    expect((await linkFor(world.paths.task.replace('notes v2', 'none'), 'outsider-token')).status).toBe(404)
    expect(await prisma.fileOpened.count()).toBe(0)
  })

  it('is none without a session, but for the picture the sign-in page shows, on a ticket naming no person', async () => {
    for (const kind of ['task', 'agent', 'person', 'team'] as const) expect((await linkFor(world.paths[kind])).status, kind).toBe(401)
    expect((await linkFor('/org/images/old.png')).status).toBe(401)
    const res = await linkFor(world.paths.org)
    expect(res.status).toBe(200)
    expect(await claimsOf(res.body.url!)).toMatchObject({ person: null, path: world.paths.org })
    expect(await prisma.fileOpened.findMany()).toMatchObject([{ personId: null, path: world.paths.org }])
  })

  it("is none while hq's relay is not connected, and records nothing", async () => {
    relayLinks.remove(world.relayId, fakeLink)
    expect((await linkFor(world.paths.agent, 'member-token')).status).toBe(503)
    expect(await prisma.fileOpened.count()).toBe(0)
  })
})

describe("a picture's link @SC-1521", () => {
  it('is signed and recorded once while its ticket lives, for the same person and file', async () => {
    const first = await linkFor(world.paths.agent, 'member-token')
    const second = await linkFor(world.paths.agent, 'member-token')
    expect(second.body.url).toBe(first.body.url)
    expect(await prisma.fileOpened.count()).toBe(1)
  })

  it('is signed anew once the file changed, and for another person', async () => {
    await linkFor(world.paths.agent, 'member-token')
    const file = path.join(sandbox, 'storage', 'agents/agt_1/images/avatar.png')
    await fs.writeFile(file, Buffer.concat([PNG, PNG]))
    const changed = await linkFor(world.paths.agent, 'member-token')
    expect(await claimsOf(changed.body.url!)).toMatchObject({ version: fileVersion(PNG.length * 2, (await fs.stat(file)).mtimeMs) })
    await linkFor(world.paths.agent, 'outsider-token')
    expect(await prisma.fileOpened.count()).toBe(3)
  })

  it("is not reused for a task's attachment: every link is signed and recorded", async () => {
    await linkFor(world.paths.task, 'member-token', true)
    await linkFor(world.paths.task, 'member-token', true)
    expect(await prisma.fileOpened.count()).toBe(2)
  })
})

describe("a picture's small copy (size=small)", () => {
  it('is linked where it is on disk, the picture itself where it is not, for someone allowed', async () => {
    const full = `/people/${world.member}/images/0b7c1d2e.webp`
    await put(`people/${world.member}/images/0b7c1d2e.webp`, PNG)
    expect(await claimsOf((await linkFor(full, 'member-token', false, true)).body.url!)).toMatchObject({ path: full })
    const version = await put(`people/${world.member}/images/0b7c1d2e-small.webp`, PDF)
    expect(await claimsOf((await linkFor(full, 'member-token', false, true)).body.url!))
      .toMatchObject({ path: `/people/${world.member}/images/0b7c1d2e-small.webp`, version })
  })

  it('is refused exactly as the picture is: without a session, and for a picture not on disk', async () => {
    const full = '/agents/agt_1/images/gone.webp'
    await put('agents/agt_1/images/gone-small.webp', PNG)
    expect((await linkFor(full, 'member-token', false, true)).status).toBe(404)
    await put('agents/agt_1/images/gone.webp', PNG)
    expect((await linkFor(full, undefined, false, true)).status).toBe(401)
    expect(await prisma.fileOpened.count()).toBe(0)
  })

  it('opens the sign-in page\'s cover without a session, as the picture itself', async () => {
    await prisma.org.updateMany({ data: { coverUrl: '/org/images/c1.webp' } })
    await put('org/images/c1.webp', PNG)
    await put('org/images/c1-small.webp', PNG)
    expect(await claimsOf((await linkFor('/org/images/c1.webp', undefined, false, true)).body.url!)).toMatchObject({ path: '/org/images/c1.webp', person: null })
  })
})

describe('hq-server @SC-1519', () => {
  it('answers no upload path with its bytes, signed in or not', async () => {
    for (const p of Object.values(world.paths)) {
      const asked: Record<string, string>[] = [{}, { authorization: 'Bearer member-token' }]
      for (const headers of asked) {
        const res = await fetch(`${base}${encode(p)}`, { headers })
        const body = Buffer.from(await res.arrayBuffer())
        expect(res.status, p).toBe(404)
        expect(body.includes(PNG) || body.includes(PDF), p).toBe(false)
      }
    }
  })
})
