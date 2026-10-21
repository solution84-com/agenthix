import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EXPORT_CHUNK_BYTES, type HostEnvelope, type HostMessage, type HostResult } from '@agenthix/core'
import { loadOrCreateKeys } from '../state/keys'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

const EXPORT_ID = 'office-server-20261015T081500Z-export-0a1b2c3d.sealed'
const SAM = { kind: 'fleetAdmin' as const, userId: 'u-sam', name: 'Sam Rivera' }
/** Stands in for the sealed file: more than two chunks, with a marker to look for in the console's state folder. */
const FILE = Buffer.concat([Buffer.from('SEALED-EXPORT-MARKER'), Buffer.alloc(2 * EXPORT_CHUNK_BYTES + 777, 9)])

let h: Harness
let host: FakeHost
let other: FakeHost
let seen = 0
/** What the fake machine was asked, in order. */
let asked: { op: string; offset?: number }[]
/** Changes a chunk's answer, or answers it as another machine. */
let tamper: ((offset: number, result: HostResult) => { result: HostResult; as?: FakeHost; altered?: boolean } | null) | null

async function pin(fake: FakeHost, hostId: string) {
  await h.ctx.hosts.pin({
    fingerprint: fake.fingerprint, hostId, identity: fake.keys.identity, machineName: hostId, siteName: hostId,
    executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: SAM.userId,
  })
  fake.consoleIdentity = (await loadOrCreateKeys(h.state)).identity
}

/** The machine's side: answers every request hq relays to it, as a host service holding FILE would. */
async function answerRequests(): Promise<void> {
  while (seen < h.link.envelopes.length) {
    const envelope = h.link.envelopes[seen++]
    const opened = await host.open(envelope)
    if (!opened.ok) continue
    const message = opened.message as { requestId: string; request: { op: string; exportId: string; offset?: number } }
    const r = message.request
    asked.push({ op: r.op, offset: r.offset })
    let result: HostResult
    if (r.op === 'backup.exportRead') {
      const offset = r.offset ?? 0
      const data = FILE.subarray(offset, offset + EXPORT_CHUNK_BYTES)
      result = { ok: true, op: 'backup.exportRead', result: { exportId: r.exportId, offset, sizeBytes: FILE.length, last: offset + data.length === FILE.length, data: data.toString('base64url') } }
    } else if (r.op === 'backup.exportDone') {
      result = { ok: true, op: 'backup.exportDone', result: { removed: true } }
    } else continue
    const changed = tamper?.(r.offset ?? 0, result) ?? null
    const reply: HostMessage = { kind: 'result', replyTo: message.requestId, result: changed?.result ?? result }
    let sealed: HostEnvelope = await (changed?.as ?? host).seal(reply)
    if (changed?.altered) sealed = { ...sealed, ct: (sealed.ct[0] === 'A' ? 'B' : 'A') + sealed.ct.slice(1) }
    await h.ctx.commands.receive(sealed)
  }
}

let pump: ReturnType<typeof setInterval>
beforeEach(async () => {
  // Short, so the cases that wait out a chunk nobody answers end quickly; long enough that three chunks sealed and
  // opened on a busy CI runner still arrive in time.
  h = await startHarness({ commandTimeouts: { short: 2000, long: 2000 } })
  host = await FakeHost.create()
  other = await FakeHost.create()
  await pin(host, 'office-server')
  await pin(other, 'other-server')
  seen = 0
  asked = []
  tamper = null
  pump = setInterval(() => { void answerRequests() }, 2)
})
afterEach(async () => {
  clearInterval(pump)
  await h.close()
})

type Raw = { status: number; headers: http.IncomingHttpHeaders; body: Buffer; complete: boolean }

/** A plain GET, as the browser's download makes it: the cookie, no CSRF header. */
function get(urlPath: string, cookie?: string): Promise<Raw> {
  const port = Number(new URL(h.base).port)
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, headers: cookie ? { cookie } : {} }, res => {
      const parts: Buffer[] = []
      res.on('data', (b: Buffer) => parts.push(b))
      const done = (complete: boolean) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(parts), complete })
      res.on('end', () => done(res.complete))
      res.on('error', () => done(false))
      res.on('aborted', () => done(false))
    })
    req.on('error', reject)
    req.end()
  })
}

async function prepare(session: { cookie: string; csrf: string }, exportId = EXPORT_ID) {
  return h.request(`/api/hosts/${host.fingerprint}/exports/${exportId}/download`, { method: 'POST', body: {}, ...session })
}

async function statusOf(session: { cookie: string; csrf: string }, downloadId: string) {
  return (await h.request(`/api/export-downloads/${downloadId}`, session)).json.download as Record<string, unknown>
}

describe('downloading an export from the Fleet Console', () => {
  it('streams the sealed file, whole, with its name and size; the machine then removes its copy, and the console kept none @SC-887', async () => {
    const session = await h.signIn()
    const prepared = await prepare(session)
    expect(prepared.status).toBe(201)
    const res = await get(prepared.json.href as string, session.cookie)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/octet-stream')
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${EXPORT_ID}"`)
    expect(res.headers['content-length']).toBe(String(FILE.length))
    expect(res.body.equals(FILE)).toBe(true)
    await until(() => asked.some(a => a.op === 'backup.exportDone'))
    await expect.poll(async () => (await statusOf(session, prepared.json.downloadId as string)).state).toBe('done')
    expect(await statusOf(session, prepared.json.downloadId as string)).toMatchObject({ sizeBytes: FILE.length, sentBytes: FILE.length, removedFromMachine: true })
    for (const f of fs.readdirSync(h.state.root, { recursive: true }).map(String)) {
      const full = path.join(h.state.root, f)
      if (fs.statSync(full).isFile()) expect(fs.readFileSync(full).includes('SEALED-EXPORT-MARKER'), f).toBe(false)
    }
  })

  it('is begun only behind the session and its CSRF token, and opened once, by the same session @SC-887', async () => {
    const session = await h.signIn()
    expect((await h.request(`/api/hosts/${host.fingerprint}/exports/${EXPORT_ID}/download`, { method: 'POST', body: {}, cookie: session.cookie })).status).toBe(401)
    expect((await prepare(session, encodeURIComponent('../../sessions.json'))).status).toBe(400)
    expect((await prepare(session, EXPORT_ID.replace('-export-', '-nightly-'))).status).toBe(400)
    const prepared = await prepare(session)
    const href = prepared.json.href as string
    // No cookie, or another session's.
    expect((await get(href)).status).toBe(401)
    const another = await h.signIn()
    expect((await get(href, another.cookie)).status).toBe(401)
    expect(asked).toEqual([])
    expect((await get(href, session.cookie)).status).toBe(200)
    // Spent.
    expect((await get(href, session.cookie)).status).toBe(404)
    expect((await get('/api/export-downloads/file/not-a-ticket', session.cookie)).status).toBe(404)
  })

  it('ends in words, keeping the machine’s copy, when a chunk is signed by another machine @SC-887', async () => {
    tamper = (offset, result) => (offset === EXPORT_CHUNK_BYTES ? { result, as: other } : null)
    const session = await h.signIn()
    const prepared = await prepare(session)
    const res = await get(prepared.json.href as string, session.cookie)
    expect(res.complete && res.body.length === FILE.length).toBe(false)
    const status = await statusOf(session, prepared.json.downloadId as string)
    expect(status).toMatchObject({ state: 'failed', problem: expect.stringMatching(/^The download stopped: office-server did not answer in time\./) })
    expect(h.ctx.commands.dropped.at(-1)?.reason).toBe('unexpected')
    expect(asked.some(a => a.op === 'backup.exportDone')).toBe(false)
  })

  it('ends in words when a chunk was altered on the way, or the machine answers with the wrong part @SC-887', async () => {
    tamper = (offset, result) => (offset === EXPORT_CHUNK_BYTES ? { result, altered: true } : null)
    const session = await h.signIn()
    let prepared = await prepare(session)
    let res = await get(prepared.json.href as string, session.cookie)
    expect(res.complete && res.body.length === FILE.length).toBe(false)
    expect(h.ctx.commands.dropped.map(d => d.reason)).toContain('bad_signature')
    expect((await statusOf(session, prepared.json.downloadId as string)).state).toBe('failed')

    tamper = (offset, result) => (offset === EXPORT_CHUNK_BYTES && result.ok && result.op === 'backup.exportRead'
      ? { result: { ...result, result: { ...result.result, offset: 0 } } } : null)
    prepared = await prepare(session)
    res = await get(prepared.json.href as string, session.cookie)
    expect(res.complete && res.body.length === FILE.length).toBe(false)
    expect(await statusOf(session, prepared.json.downloadId as string)).toMatchObject({
      state: 'failed', problem: 'The download stopped: the machine answered with another part of the export. Download it again.',
    })
    expect(asked.some(a => a.op === 'backup.exportDone')).toBe(false)
  })

  it('says why when the export is no longer on the machine, before anything is sent @SC-887', async () => {
    tamper = (_offset, result) => ({ result: { ok: false, op: result.op, refusal: { code: 'not_found', message: 'This export is no longer on office-server.' } } as HostResult })
    const session = await h.signIn()
    const prepared = await prepare(session)
    const res = await get(prepared.json.href as string, session.cookie)
    expect(res.status).toBe(404)
    expect(await statusOf(session, prepared.json.downloadId as string)).toMatchObject({ state: 'failed', problem: 'This export is no longer on office-server.' })
  })

  it('is not a command the API passes on by itself @SC-866', async () => {
    const session = await h.signIn()
    for (const request of [{ op: 'backup.exportRead', exportId: EXPORT_ID, offset: 0 }, { op: 'backup.exportDone', exportId: EXPORT_ID }]) {
      const res = await h.request(`/api/hosts/${host.fingerprint}/commands`, { method: 'POST', body: { request }, ...session })
      expect(res.status).toBe(400)
    }
    expect(h.link.envelopes).toHaveLength(0)
    void SAM
  })
})
