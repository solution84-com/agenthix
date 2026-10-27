/**
 * hq's uploads, served by hq's relay itself from hq's storage folder mounted read-only: the ticket verified with core's
 * verifier as this relay's own, the path confined to the upload patterns and to the folder's real path, no link
 * followed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { RELAY_STREAMS_PER_PERSON } from '@agenthix/core'
import { Load } from '../load'
import { openUploadFolder, type UploadFolder } from '../uploads/uploadFolder'
import { APP_ORIGIN, ask, startRelay, type Answer, type Harness } from '../test/harness'
import { makeSigner } from '../test/signer'
import { uploadTicketClaims } from '../test/signer'
import { makeUploadsOnDisk, type UploadsOnDisk } from '../test/uploadsOnDisk'

let disk: UploadsOnDisk
let folder: UploadFolder
let relay: Harness

beforeAll(() => {
  disk = makeUploadsOnDisk()
  const opened = openUploadFolder(disk.root)
  if (!opened.ok) throw new Error(opened.problem)
  folder = opened.folder
})
afterAll(() => disk.remove())
afterEach(async () => { await relay?.close() })

const NOTES = '/files/task/t1/a1/notes.txt'
const start = (over: Parameters<typeof startRelay>[0] = {}) => startRelay({ uploads: folder, ...over }).then(r => { relay = r })
const ticket = (path: string, over: Record<string, unknown> = {}) => relay.signer.sign(uploadTicketClaims(path, safeVersion(path), over))
function safeVersion(path: string): string {
  try {
    return disk.version(path)
  } catch {
    return '1:1'
  }
}

function expectSecurityHeaders(a: Answer) {
  expect(a.headers['content-security-policy']).toBe('sandbox')
  expect(a.headers['x-content-type-options']).toBe('nosniff')
  expect(a.headers['referrer-policy']).toBe('no-referrer')
  expect(a.headers['access-control-allow-credentials']).toBeUndefined()
}

describe('an upload ticket for this relay @SC-1479', () => {
  it('serves the upload from the folder, with the same headers as a site\'s file', async () => {
    await start()
    const a = await ask(relay.port, `/t/${ticket(NOTES)}`, { headers: { Origin: APP_ORIGIN } })
    expect(a.status).toBe(200)
    expect(a.body.toString()).toBe('hello upload')
    expect(a.headers['content-type']).toBe('text/plain')
    expect(a.headers['content-length']).toBe('12')
    expect(a.headers['content-disposition']).toMatch(/^inline; filename="notes.txt"/)
    expect(a.headers['accept-ranges']).toBe('bytes')
    expect(a.headers['access-control-allow-origin']).toBe(APP_ORIGIN)
    expectSecurityHeaders(a)
  })

  it('serves every kind of upload path, nested attachments included', async () => {
    await start()
    for (const path of ['/files/task/t1/a1/sub/deep.md', '/agents/ag1/images/face.png', '/org/images/logo.png']) {
      expect((await ask(relay.port, `/t/${ticket(path)}`)).status).toBe(200)
    }
  })

  it('answers a range, and HEAD without a body', async () => {
    await start()
    const ranged = await ask(relay.port, `/t/${ticket(NOTES)}`, { headers: { Range: 'bytes=6-11' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers['content-range']).toBe('bytes 6-11/12')
    expect(ranged.body.toString()).toBe('upload')
    const past = await ask(relay.port, `/t/${ticket(NOTES)}`, { headers: { Range: 'bytes=50-' } })
    expect(past.status).toBe(416)
    expect(past.headers['content-range']).toBe('bytes */12')
    const head = await ask(relay.port, `/t/${ticket(NOTES)}`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers['content-length']).toBe('12')
    expect(head.body.length).toBe(0)
  })

  it('sends a download as an attachment and an octet stream', async () => {
    await start()
    const a = await ask(relay.port, `/t/${ticket(NOTES, { purpose: 'download' })}`)
    expect(a.headers['content-type']).toBe('application/octet-stream')
    expect(a.headers['content-disposition']).toMatch(/^attachment; filename="notes.txt"/)
  })

  it('refuses a ticket whose version is not the file\'s', async () => {
    await start()
    const a = await ask(relay.port, `/t/${relay.signer.sign(uploadTicketClaims(NOTES, '12:1'))}`)
    expect(a.status).toBe(409)
    expectSecurityHeaders(a)
  })
})

describe('what an upload ticket cannot do @SC-1480 @SC-1567', () => {
  it('is refused when made for another relay, signed by another key, expired or for another purpose', async () => {
    await start()
    const stranger = makeSigner('hq-key-1')
    const now = Math.floor(Date.now() / 1000)
    for (const t of [
      ticket(NOTES, { aud: 'relay-2', relay: 'relay-2' }),
      ticket(NOTES, { relay: 'relay-2' }),
      stranger.sign(uploadTicketClaims(NOTES, disk.version(NOTES))),
      ticket(NOTES, { iat: now - 600, exp: now - 300 }),
      ticket(NOTES, { purpose: 'ide-session' }),
      ticket(NOTES, { site: 'site-1' }),
    ]) {
      const a = await ask(relay.port, `/t/${t}`)
      expect(a.status).toBe(403)
      expectSecurityHeaders(a)
      expect(a.body.toString()).not.toContain('hello')
    }
  })

  it('is refused for a path outside the upload patterns or one that steps up', async () => {
    await start()
    for (const path of [
      '/models/weights.bin', '/files/task/t1/a1/../../../../secret.txt', '/files/task/t1/../t1/a1/notes.txt',
      '/files/task/t1/a1/./notes.txt', '/secret.txt', 'files/task/t1/a1/notes.txt',
    ]) {
      const a = await ask(relay.port, `/t/${ticket(path)}`)
      expect(a.status).toBe(403)
      expect(a.body.toString()).not.toContain('secret')
    }
  })

  it('never follows a link, to a file or a folder, inside the folder or out, nor a hard link', async () => {
    await start()
    for (const path of [
      '/files/task/t1/a1/link.txt', '/files/task/t1/a1/inside-link.txt', '/people/p1/images/x.png',
      '/files/task/t2/a1/notes.txt', '/files/task/t1/a1/hard.txt', '/files/task/t1/a1/folder.txt',
      '/files/task/t1/a1/missing.txt',
    ]) {
      const a = await ask(relay.port, `/t/${ticket(path)}`)
      expect(a.status, path).toBe(404)
      expect(a.body.toString()).not.toMatch(/secret|outside|hello/)
    }
  })

  it('takes a ticket with no person only for a picture shown before sign-in, counted in one bucket', async () => {
    await start({ load: new Load(1) })
    expect((await ask(relay.port, `/t/${ticket(NOTES, { person: null })}`)).status).toBe(403)
    expect((await ask(relay.port, `/t/${ticket('/org/images/logo.png', { person: null })}`)).status).toBe(200)
    expect(relay.load.take(null)).not.toBe(false)
    expect((await ask(relay.port, `/t/${ticket('/org/images/logo.png', { person: null })}`)).status).toBe(429)
    expect((await ask(relay.port, `/t/${ticket('/org/images/logo.png')}`)).status).toBe(200)
  })

  it(`holds a person to ${RELAY_STREAMS_PER_PERSON} streams across uploads and sites alike`, async () => {
    const load = new Load(RELAY_STREAMS_PER_PERSON)
    await start({ load })
    for (let i = 0; i < RELAY_STREAMS_PER_PERSON; i++) load.take('person-1')
    expect((await ask(relay.port, `/t/${ticket(NOTES)}`)).status).toBe(429)
  })

  it('says plainly that uploads are not served when the folder is not there, and serves nothing', async () => {
    await start({ uploads: null })
    const a = await ask(relay.port, `/t/${ticket(NOTES)}`)
    expect(a.status).toBe(503)
    expect(a.body.toString()).toMatch(/not serving HQ's uploads/)
    expectSecurityHeaders(a)
  })

  it('answers 503 until hq has named the relay', async () => {
    await start()
    relay.setRelayId(null)
    expect((await ask(relay.port, `/t/${ticket(NOTES)}`)).status).toBe(503)
  })

  it('never logs a ticket or a path @SC-1563', async () => {
    const out = vi.spyOn(console, 'log')
    const err = vi.spyOn(console, 'error')
    const warn = vi.spyOn(console, 'warn')
    await start()
    const t = ticket(NOTES)
    await ask(relay.port, `/t/${t}?q=secret-query`)
    await ask(relay.port, `/t/${ticket('/files/task/t1/a1/link.txt')}`)
    await ask(relay.port, `/t/${ticket(NOTES, { aud: 'relay-2' })}`)
    const all = [...relay.logs, ...[out, err, warn].flatMap(s => s.mock.calls.map(c => c.join(' ')))].join('\n')
    expect(all).not.toContain(t.split('.')[1])
    expect(all).not.toContain('secret-query')
    expect(all).not.toContain('notes.txt')
    expect(all).not.toContain('link.txt')
    out.mockRestore(); err.mockRestore(); warn.mockRestore()
  })
})

describe('the upload folder @SC-1480', () => {
  it('is a problem in plain words when unset, missing or not a folder', () => {
    expect(openUploadFolder(undefined)).toMatchObject({ ok: false, problem: expect.stringMatching(/HQ_UPLOADS_ROOT is not set/) })
    expect(openUploadFolder(`${disk.base}/nowhere`)).toMatchObject({ ok: false, problem: expect.stringMatching(/not a folder/) })
    expect(openUploadFolder(`${disk.base}/secret.txt`)).toMatchObject({ ok: false, problem: expect.stringMatching(/not a folder/) })
  })
})
