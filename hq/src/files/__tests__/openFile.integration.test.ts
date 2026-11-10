/**
 * Opening a file (spec part 1, *Opening a file*; T9, T11), against the real test database: access is checked as each
 * space's content read checks it, every ticket hq signs is recorded, and each state is answered — with the site's
 * channel replaced, since it leaves hq.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { generateKeyPair, exportJWK, calculateJwkThumbprint, type CryptoKey } from 'jose'
import {
  verifyRelayToken, FILE_TICKET_TOKEN_TYPE, LocationFileError, type FileAboutResult, type JsonWebKeySet,
} from '@agenthix/core'
import type { WebSocket } from 'ws'
import { prisma } from '../../test/db'
import { createProject, createUser, ensureExecutionSite, joinProjectAs } from '../../test/factories'

const keys = vi.hoisted(() => ({ kid: '', key: null as unknown, jwks: { keys: [] } as { keys: unknown[] } }))
const channel = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/identity/signingKeyService', () => ({
  SIGNING_ALG: 'RS256',
  getSigningKey: async () => ({ kid: keys.kid, key: keys.key }),
}))
vi.mock('../../sites/channel', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../sites/channel')
  return { ...actual, siteChannelRegistry: { ...(actual.siteChannelRegistry as object), request: channel.request, get: () => null } }
})

import { openFileAction } from '../operations'
import { relayLinks } from '../../relays'
import { ChannelRequestFailed } from '../../sites/channel/pendingRequests'

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(pair.publicKey)
  keys.kid = await calculateJwkThumbprint(jwk)
  keys.key = pair.privateKey as CryptoKey
  keys.jwks = { keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid: keys.kid, alg: 'RS256', use: 'sig' }] }
})

const saved = { files: process.env.FILES_ORIGIN, client: process.env.WASP_WEB_CLIENT_URL }
beforeEach(() => {
  process.env.FILES_ORIGIN = 'https://files.example.com'
  process.env.WASP_WEB_CLIENT_URL = 'https://hq.example.com'
  channel.request.mockReset()
  channel.request.mockImplementation(async () => answer('plan.md'))
})
afterEach(() => {
  for (const [key, value] of [['FILES_ORIGIN', saved.files], ['WASP_WEB_CLIENT_URL', saved.client]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const answer = (name: string, looksLikeText = true): FileAboutResult =>
  ({ ok: true, name, size: 120, modifiedAt: '2026-10-26T10:00:00.000Z', version: '120:1793008800000', contentType: 'text/plain', looksLikeText })
const ctx = (user?: { id: string }) => ({ user })
const fakeLink = { close() {} } as unknown as WebSocket

/** The default site on hq's relay, connected unless asked otherwise. */
async function fleet(opts: { connected?: boolean; relay?: boolean } = {}) {
  const site = await ensureExecutionSite()
  if (opts.relay === false) return { site, relay: null }
  const relay = await prisma.relay.create({ data: { name: 'hq-box', isHq: true, credentialHash: 'c'.repeat(64), state: 'ON' } })
  await prisma.executionSite.update({ where: { id: site.id }, data: { relayId: relay.id } })
  if (opts.connected !== false) relayLinks.add(relay.id, fakeLink)
  return { site, relay }
}
afterEach(async () => {
  for (const r of await prisma.relay.findMany()) relayLinks.remove(r.id, fakeLink)
})

async function member(role: 'MEMBER' | 'VIEWER' = 'MEMBER') {
  const project = await createProject()
  const me = await createUser()
  await joinProjectAs(project.id, me.id, role)
  return { project, me }
}
const placeFile = (projectId: string, path = 'docs/plan.md') =>
  ({ space: 'place' as const, loc: { ownerType: 'project' as const, ownerId: projectId, workspaceId: null, taskId: null }, path })

describe('opening a place\'s file @SC-1509', () => {
  it('answers both links on hq\'s relay, tickets the site accepts, and records each ticket @SC-1572', async () => {
    const { site, relay } = await fleet()
    const { project, me } = await member('VIEWER')
    const result = await openFileAction({ file: placeFile(project.id) }, ctx(me))
    expect(result).toMatchObject({ state: 'ready', facts: { name: 'plan.md', kind: 'markdown', version: '120:1793008800000' } })
    if (result.state !== 'ready') return
    expect(result.previewLink.startsWith('https://files.example.com/t/')).toBe(true)
    expect(result.downloadLink.startsWith('https://files.example.com/t/')).toBe(true)

    expect(channel.request).toHaveBeenCalledWith(site.siteId, 'file.about', placeFile(project.id), expect.any(Number))
    const ticket = result.previewLink.slice('https://files.example.com/t/'.length)
    const verdict = await verifyRelayToken(ticket, {
      type: FILE_TICKET_TOKEN_TYPE, keys: keys.jwks as unknown as JsonWebKeySet, audience: site.siteId, nowMs: Date.now(), relay: relay!.id,
    })
    expect(verdict).toMatchObject({ ok: true, claims: { purpose: 'preview', person: me.id, path: 'docs/plan.md', version: '120:1793008800000' } })

    const rows = await prisma.fileOpened.findMany({ orderBy: { purpose: 'asc' } })
    expect(rows).toMatchObject([
      { purpose: 'download', personId: me.id, space: 'place', ownerType: 'project', ownerId: project.id, path: 'docs/plan.md', version: '120:1793008800000', siteId: site.siteId, relayId: relay!.id },
      { purpose: 'preview', personId: me.id },
    ])
  })

  it('answers not-found to someone outside the project, without asking the site or recording anything @SC-1510', async () => {
    await fleet()
    const { project } = await member()
    const outsider = await createUser()
    expect(await openFileAction({ file: placeFile(project.id) }, ctx(outsider))).toEqual({ state: 'not-found' })
    expect(channel.request).not.toHaveBeenCalled()
    expect(await prisma.fileOpened.count()).toBe(0)
  })

  it('answers not-found for another person\'s own files @SC-1510', async () => {
    await fleet()
    const owner = await createUser()
    const other = await createUser()
    const file = { space: 'place' as const, loc: { ownerType: 'user' as const, ownerId: owner.id, workspaceId: null, taskId: null }, path: 'a.txt' }
    expect(await openFileAction({ file }, ctx(other))).toEqual({ state: 'not-found' })
    expect(await openFileAction({ file }, ctx(owner))).toMatchObject({ state: 'ready' })
  })

  it('answers not-found when the site refuses the path as outside the place, or not there @SC-1510', async () => {
    await fleet()
    const { project, me } = await member()
    channel.request.mockRejectedValueOnce(new ChannelRequestFailed(new LocationFileError('outside', 'x').message, 'failed'))
    expect(await openFileAction({ file: placeFile(project.id, 'link-out') }, ctx(me))).toEqual({ state: 'not-found' })
    channel.request.mockResolvedValueOnce({ ok: false, refusal: 'not-found' })
    expect(await openFileAction({ file: placeFile(project.id) }, ctx(me))).toEqual({ state: 'not-found' })
    expect(await prisma.fileOpened.count()).toBe(0)
  })
})

describe('the states @SC-1511', () => {
  it('relay-unavailable at once when hq\'s relay is not connected: the site is not asked and nothing is signed', async () => {
    const { site } = await fleet({ connected: false })
    const { project, me } = await member()
    expect(await openFileAction({ file: placeFile(project.id) }, ctx(me)))
      .toEqual({ state: 'relay-unavailable', siteName: expect.stringContaining(site.label), relayName: "hq-box · HQ's relay" })
    expect(channel.request).not.toHaveBeenCalled()
    expect(await prisma.fileOpened.count()).toBe(0)
  })

  it('no-relay for a site placed on none, or on a removed one', async () => {
    const { site } = await fleet({ relay: false })
    const { project, me } = await member()
    expect(await openFileAction({ file: placeFile(project.id) }, ctx(me))).toMatchObject({ state: 'no-relay' })
    const removed = await prisma.relay.create({ data: { name: 'old', isHq: true, state: 'REMOVED' } })
    await prisma.executionSite.update({ where: { id: site.id }, data: { relayId: removed.id } })
    relayLinks.add(removed.id, fakeLink)
    expect(await openFileAction({ file: placeFile(project.id) }, ctx(me))).toMatchObject({ state: 'no-relay' })
  })

  it.each(['offline', 'timeout', 'disconnected', 'unknown_method'])('site-unavailable when the site is %s, recording nothing', async code => {
    await fleet()
    const { project, me } = await member()
    channel.request.mockRejectedValueOnce(new ChannelRequestFailed('no answer', code))
    expect(await openFileAction({ file: placeFile(project.id) }, ctx(me))).toEqual({ state: 'site-unavailable' })
    expect(await prisma.fileOpened.count()).toBe(0)
  })

  it('no-files-address for a PDF on a bare address: a download on the bare door, and only its ticket recorded', async () => {
    delete process.env.FILES_ORIGIN
    process.env.WASP_WEB_CLIENT_URL = 'http://192.168.1.20'
    await fleet()
    const { project, me } = await member()
    channel.request.mockResolvedValueOnce(answer('q3.pdf', false))
    const result = await openFileAction({ file: placeFile(project.id, 'q3.pdf') }, ctx(me))
    expect(result).toMatchObject({ state: 'no-files-address', facts: { kind: 'pdf' } })
    if (result.state !== 'no-files-address') return
    expect(result.downloadLink.startsWith('http://192.168.1.20/relay/t/')).toBe(true)
    expect(await prisma.fileOpened.findMany()).toMatchObject([{ purpose: 'download', path: 'q3.pdf' }])
  })
})

describe('artefacts and knowledge @SC-1513', () => {
  it('opens a project\'s artefact for a member, and not for anyone else', async () => {
    await fleet()
    const { project, me } = await member()
    const file = { space: 'artefact' as const, owner: { ownerType: 'project' as const, ownerId: project.id }, name: 'chart.png' }
    channel.request.mockResolvedValue(answer('chart.png', false))
    expect(await openFileAction({ file }, ctx(me))).toMatchObject({ state: 'ready', facts: { kind: 'image' } })
    expect(await openFileAction({ file }, ctx(await createUser()))).toEqual({ state: 'not-found' })
    expect(await prisma.fileOpened.findFirst()).toMatchObject({ space: 'artefact', path: 'chart.png', ownerId: project.id })
  })

  it('opens the organisation\'s page for anyone, named without an id, and a person\'s own pages only for them', async () => {
    const { site } = await fleet()
    const me = await createUser()
    const org = { space: 'knowledge' as const, owner: { ownerType: 'org' }, path: 'processes/release.md' }
    expect(await openFileAction({ file: org } as never, ctx(me))).toMatchObject({ state: 'ready' })
    expect(channel.request).toHaveBeenCalledWith(site.siteId, 'file.about',
      { space: 'knowledge', owner: { ownerType: 'org', ownerId: 'org' }, path: 'processes/release.md' }, expect.any(Number))

    const theirs = { space: 'knowledge' as const, owner: { ownerType: 'user' as const, ownerId: (await createUser()).id }, path: 'notes.md' }
    expect(await openFileAction({ file: theirs }, ctx(me))).toEqual({ state: 'not-found' })
  })
})

describe('what it refuses outright @SC-1510', () => {
  it('refuses without a session, and a request that names no site\'s file', async () => {
    const me = await createUser()
    await expect(openFileAction({ file: placeFile('p1') }, ctx())).rejects.toMatchObject({ statusCode: 401 })
    await expect(openFileAction({ file: { space: 'upload', path: '/org/images/logo.png' } } as never, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
    await expect(openFileAction({ file: placeFile('p1', '../../etc/passwd') }, ctx(me))).rejects.toMatchObject({ statusCode: 400 })
  })
})
