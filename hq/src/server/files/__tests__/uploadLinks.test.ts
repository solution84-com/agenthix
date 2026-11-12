/**
 * The upload link over a real HTTP server (adr-0153, T2, T11): a link to hq's relay, on a ticket hq's relay accepts
 * for this person, this file and its version, signed only after access is granted and only while the relay is there.
 * Access and the relay are stand-ins here (uploadAccess.test.ts and the integration test have them); the signer and
 * core's verifier are real.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import type { Stats } from 'node:fs'
import express from 'express'
import { generateKeyPair, exportJWK, calculateJwkThumbprint, type CryptoKey } from 'jose'
import {
  verifyRelayToken, fileVersion, FILE_TICKET_TOKEN_TYPE, type FileTicketInput, type JsonWebKeySet, type RelayAddress,
} from '@agenthix/core'

const keys = vi.hoisted(() => ({ kid: '', key: null as unknown, jwks: { keys: [] } as { keys: unknown[] } }))
vi.mock('../../identity/signingKeyService', () => ({
  SIGNING_ALG: 'RS256',
  getSigningKey: async () => ({ kid: keys.kid, key: keys.key }),
}))

import { signFileTicket } from '../../../relays/relayTokens'
import { uploadLinkHandler, smallPicturePath, RELAY_UNAVAILABLE, type UploadLinkDeps } from '../uploadLinks'
import type { UploadAccess } from '../uploadAccess'

const STAT = { size: 2048, mtimeMs: 1793008800123.4 } as Stats
const RELAY = 'relay-hq'
const sessions = new Map([['alice-token', 'usr_alice']])

let relay: { id: string; address: RelayAddress } | null
let access: (p: string, user: string | null) => UploadAccess
const issued: FileTicketInput[] = []

const deps: UploadLinkDeps = {
  resolveUserId: async req => sessions.get(req.headers.authorization?.replace('Bearer ', '') ?? '') ?? null,
  access: async (p, user) => access(p, user),
  hqRelay: async () => relay,
  issue: async input => { issued.push(input); return signFileTicket(input) },
}

let server: http.Server
let base: string

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(pair.publicKey)
  keys.kid = await calculateJwkThumbprint(jwk)
  keys.key = pair.privateKey as CryptoKey
  keys.jwks = { keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid: keys.kid, alg: 'RS256', use: 'sig' }] }
  const app = express()
  app.get('/file-link', uploadLinkHandler(deps))
  server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())) })

beforeEach(() => {
  issued.length = 0
  relay = { id: RELAY, address: { origin: 'https://files.example.com', door: 'files-address' } }
  access = (_p, user) => (user ? { ok: true, stat: STAT } : { ok: false, status: 401 })
})

async function ask(filePath: string, opts: { token?: string; download?: boolean; small?: boolean } = {}) {
  const q = new URLSearchParams({ path: filePath })
  if (opts.download) q.set('download', '1')
  if (opts.small) q.set('size', 'small')
  const res = await fetch(`${base}/file-link?${q}`, { headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {} })
  return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() as { url?: string; expiresAt?: string; error?: string } }
}

const verify = (ticket: string) => verifyRelayToken(ticket, {
  type: FILE_TICKET_TOKEN_TYPE, keys: keys.jwks as unknown as JsonWebKeySet, audience: RELAY, relay: RELAY, nowMs: Date.now(), spaces: ['upload'],
})

describe('a link to an upload @SC-1518', () => {
  it("is to hq's relay, on a ticket it accepts for this person, this file at its version on disk, as a preview", async () => {
    const res = await ask('/files/task/tsk_1/u-1/notes%20v2.pdf', { token: 'alice-token' })
    expect(res.status).toBe(200)
    expect(res.cache).toBe('private, no-store')
    const url = new URL(res.body.url!)
    expect(url.origin).toBe('https://files.example.com')
    expect(url.pathname).toMatch(/^\/t\/[\w-]+\.[\w-]+\.[\w-]+$/)
    const verdict = await verify(url.pathname.slice('/t/'.length))
    expect(verdict).toMatchObject({
      ok: true,
      claims: { space: 'upload', path: '/files/task/tsk_1/u-1/notes v2.pdf', person: 'usr_alice', purpose: 'preview', version: fileVersion(STAT.size, STAT.mtimeMs) },
    })
    expect(Date.parse(res.body.expiresAt!)).toBeGreaterThan(Date.now())
  })

  it('names a download when asked for one, and goes under the bare door on a bare address', async () => {
    relay = { id: RELAY, address: { origin: 'http://192.168.1.20', door: 'bare-address' } }
    const res = await ask('/agents/agt_1/images/a.png', { token: 'alice-token', download: true })
    const url = new URL(res.body.url!)
    expect(url.origin).toBe('http://192.168.1.20')
    expect(url.pathname.startsWith('/relay/t/')).toBe(true)
    expect(await verify(url.pathname.slice('/relay/t/'.length))).toMatchObject({ ok: true, claims: { purpose: 'download' } })
  })

  it('is made without a session only for a picture the sign-in page shows, on a ticket naming no person', async () => {
    access = p => (p === '/org/images/a.png' ? { ok: true, stat: STAT } : { ok: false, status: 401 })
    const res = await ask('/org/images/a.png')
    expect(res.status).toBe(200)
    const ticket = new URL(res.body.url!).pathname.slice('/t/'.length)
    expect(await verify(ticket)).toMatchObject({ ok: true, claims: { person: null } })
    expect((await ask('/agents/agt_1/images/a.png')).status).toBe(401)
  })

  it('is refused, and nothing signed, for someone not allowed, a path that does not decode, and no session', async () => {
    access = () => ({ ok: false, status: 404 })
    expect(await ask('/files/task/tsk_1/u-1/x.pdf', { token: 'alice-token' })).toMatchObject({ status: 404, body: { error: 'Not found' } })
    expect((await ask('/files/task/tsk_1/u-1/%E0%A4%A.pdf', { token: 'alice-token' })).status).toBe(404)
    access = () => ({ ok: false, status: 401 })
    expect(await ask('/files/task/tsk_1/u-1/x.pdf')).toMatchObject({ status: 401, body: { error: 'Unauthorized' } })
    expect(issued).toEqual([])
  })

  it("says so at once, signing nothing, while hq's relay is not there", async () => {
    relay = null
    expect(await ask('/agents/agt_1/images/a.png', { token: 'alice-token' })).toMatchObject({ status: 503, body: { error: RELAY_UNAVAILABLE } })
    expect(issued).toEqual([])
  })
})

describe('a link to a picture\'s small copy (size=small)', () => {
  const PICTURE = '/agents/agt_1/images/0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3.webp'
  const SMALL = '/agents/agt_1/images/0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3-small.webp'
  const SMALL_STAT = { size: 512, mtimeMs: 1793008800999 } as Stats
  const claimsOf = async (res: { body: { url?: string } }) =>
    (await verify(new URL(res.body.url!).pathname.slice('/t/'.length)) as { claims: { path: string; version: string } }).claims

  it('names the small copy when it is there, at its own version', async () => {
    access = (p, user) => (!user ? { ok: false, status: 401 } : p === SMALL ? { ok: true, stat: SMALL_STAT } : { ok: true, stat: STAT })
    const res = await ask(PICTURE, { token: 'alice-token', small: true })
    expect(res.status).toBe(200)
    expect(await claimsOf(res)).toMatchObject({ path: SMALL, version: fileVersion(SMALL_STAT.size, SMALL_STAT.mtimeMs) })
  })

  it('names the picture itself when there is no small copy, and without size=small', async () => {
    access = (p, user) => (user && p === PICTURE ? { ok: true, stat: STAT } : { ok: false, status: 404 })
    expect(await claimsOf(await ask(PICTURE, { token: 'alice-token', small: true }))).toMatchObject({ path: PICTURE })
    access = () => ({ ok: true, stat: STAT })
    expect(await claimsOf(await ask(PICTURE, { token: 'alice-token' }))).toMatchObject({ path: PICTURE })
  })

  it('refuses exactly what the full link refuses, even when the small copy could be opened', async () => {
    access = p => (p === SMALL ? { ok: true, stat: SMALL_STAT } : { ok: false, status: 404 })
    expect(await ask(PICTURE, { token: 'alice-token', small: true })).toMatchObject({ status: 404, body: { error: 'Not found' } })
    access = p => (p === SMALL ? { ok: true, stat: SMALL_STAT } : { ok: false, status: 401 })
    expect(await ask(PICTURE, { small: true })).toMatchObject({ status: 401, body: { error: 'Unauthorized' } })
    expect(issued).toEqual([])
  })

  it('is asked of no task attachment, small copy or other name', () => {
    expect(smallPicturePath(PICTURE)).toBe(SMALL)
    expect(smallPicturePath('/org/images/a.webp')).toBe('/org/images/a-small.webp')
    expect(smallPicturePath('/files/task/tsk_1/u-1/a.webp')).toBeNull()
    expect(smallPicturePath(SMALL)).toBeNull()
    expect(smallPicturePath('/people/usr_1/images/a.png')).toBeNull()
  })
})
