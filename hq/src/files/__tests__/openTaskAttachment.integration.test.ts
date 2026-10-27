/**
 * Opening a task's attachment beside the task (spec part 3, *A task's files*; T9, T11), against the real test database
 * and a real filesystem: a member gets an `upload` ticket pair on hq's relay, recorded; an outsider and an attachment
 * that isn't there get `not-found`, and nothing is signed; hq's relay not connected is said at once.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { WebSocket } from 'ws'
import { generateKeyPair, exportJWK, calculateJwkThumbprint, type CryptoKey } from 'jose'
import { verifyRelayToken, fileVersion, FILE_TICKET_TOKEN_TYPE, type JsonWebKeySet } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createProject, createTestTask, createUser, joinProjectAs } from '../../test/factories'

const keys = vi.hoisted(() => ({ kid: '', key: null as unknown, jwks: { keys: [] } as { keys: unknown[] } }))

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma, config: { allowedCORSOrigins: [] } }
})
vi.mock('../../server/identity/signingKeyService', () => ({
  SIGNING_ALG: 'RS256',
  getSigningKey: async () => ({ kid: keys.kid, key: keys.key }),
}))

import { hqMachineName } from '../../sites/defaultSite'
import { openTaskAttachmentAction } from '../operations'
import { relayLinks } from '../../relays'

const fakeLink = { close() {} } as unknown as WebSocket
const MD = Buffer.from('# Q3\n\nRevenue grew 6%.\n')
let sandbox: string
const saved = { root: process.env.HQ_STORAGE_ROOT, files: process.env.FILES_ORIGIN, client: process.env.WASP_WEB_CLIENT_URL }

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(pair.publicKey)
  keys.kid = await calculateJwkThumbprint(jwk)
  keys.key = pair.privateKey as CryptoKey
  keys.jwks = { keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid: keys.kid, alg: 'RS256', use: 'sig' }] }
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'hq-task-attachment-'))
  process.env.HQ_STORAGE_ROOT = path.join(sandbox, 'storage')
  process.env.FILES_ORIGIN = 'https://files.example.com'
  process.env.WASP_WEB_CLIENT_URL = 'https://hq.example.com'
})
afterAll(async () => {
  for (const [key, value] of [['HQ_STORAGE_ROOT', saved.root], ['FILES_ORIGIN', saved.files], ['WASP_WEB_CLIENT_URL', saved.client]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  if (sandbox) await fs.rm(sandbox, { recursive: true, force: true })
})

type World = { relayId: string; member: string; outsider: string; attachmentId: string; uploadPath: string; version: string }
let world: World

beforeEach(async () => {
  const relay = await prisma.relay.create({ data: { name: 'hq-box', isHq: true, credentialHash: 'c'.repeat(64), state: 'ON' } })
  relayLinks.add(relay.id, fakeLink)
  const member = await createUser()
  const outsider = await createUser()
  const project = await createProject({ accessLevel: 'PRIVATE' })
  await joinProjectAs(project.id, member.id)
  const task = await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: member.id } })
  const file = path.join(sandbox, 'storage', 'tasks', task.id, 'u-1', 'q3 notes.md')
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, MD)
  const stat = await fs.stat(file)
  const attachment = await prisma.taskAttachment.create({
    data: { taskId: task.id, uuid: 'u-1', fileName: 'q3 notes.md', mimeType: 'text/markdown', fileSizeBytes: MD.length },
  })
  world = {
    relayId: relay.id, member: member.id, outsider: outsider.id, attachmentId: attachment.id,
    uploadPath: `/files/task/${task.id}/u-1/q3 notes.md`, version: fileVersion(stat.size, stat.mtimeMs),
  }
})
afterEach(async () => {
  for (const r of await prisma.relay.findMany()) relayLinks.remove(r.id, fakeLink)
})

const open = (userId: string, attachmentId = world.attachmentId) =>
  openTaskAttachmentAction({ attachmentId }, { user: { id: userId } })

async function claimsOf(link: string) {
  const token = link.split('/t/')[1]
  const verdict = await verifyRelayToken(token, {
    type: FILE_TICKET_TOKEN_TYPE, keys: keys.jwks as JsonWebKeySet, audience: world.relayId, relay: world.relayId,
    nowMs: Date.now(), purposes: ['preview', 'download'], spaces: ['upload'],
  })
  if (!verdict.ok) throw new Error(verdict.refusal)
  return verdict.claims
}

describe('opening a task attachment @SC-1516', () => {
  it('gives a member the facts and both links on hq\'s relay, at the version on disk, each recorded', async () => {
    const answer = await open(world.member)
    if (answer.state !== 'ready') throw new Error(answer.state)
    expect(answer.facts).toEqual({
      name: 'q3 notes.md', size: MD.length, version: world.version, contentType: 'text/markdown', kind: 'markdown',
    })
    expect(answer.previewLink.startsWith('https://files.example.com/t/')).toBe(true)
    expect(await claimsOf(answer.previewLink)).toMatchObject({
      space: 'upload', path: world.uploadPath, purpose: 'preview', person: world.member, version: world.version,
    })
    expect(await claimsOf(answer.downloadLink)).toMatchObject({ purpose: 'download', path: world.uploadPath })
    const rows = await prisma.fileOpened.findMany({ where: { personId: world.member } })
    expect(rows.map(r => [r.space, r.path, r.purpose]).sort()).toEqual([
      ['upload', world.uploadPath, 'download'], ['upload', world.uploadPath, 'preview'],
    ])
  })

  it('answers an outsider and an unknown attachment as not-found, and records nothing', async () => {
    expect(await open(world.outsider)).toEqual({ state: 'not-found' })
    expect(await open(world.member, 'no-such-attachment')).toEqual({ state: 'not-found' })
    expect(await prisma.fileOpened.count()).toBe(0)
  })

  it('answers a file gone from disk as not-found', async () => {
    await fs.rm(path.join(sandbox, 'storage', 'tasks'), { recursive: true, force: true })
    expect(await open(world.member)).toEqual({ state: 'not-found' })
    expect(await prisma.fileOpened.count()).toBe(0)
  })

  it('says hq\'s relay isn\'t answering when it is not connected, and signs nothing', async () => {
    relayLinks.remove(world.relayId, fakeLink)
    expect(await open(world.member)).toEqual({ state: 'relay-unavailable', siteName: 'HQ', relayName: `${hqMachineName()} · HQ's relay` })
    expect(await prisma.fileOpened.count()).toBe(0)
  })

  it('refuses without a session', async () => {
    await expect(openTaskAttachmentAction({ attachmentId: world.attachmentId }, {})).rejects.toMatchObject({ statusCode: 401 })
  })
})
