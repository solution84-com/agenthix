/**
 * The bare-address door: an installation with no files address sends `/relay/…` on hq's own address to hq's relay.
 * That is hq's origin, so nothing is answered inline: a download is an attachment, a picture keeps its type as an
 * attachment, text goes as plain text, and a kind that needs a files address (a PDF's preview) is refused.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { RELAY_BARE_TICKET_PATH_PREFIX, type FileServeHead } from '@agenthix/core'
import { Load } from '../load'
import { openUploadFolder, type UploadFolder } from '../uploads/uploadFolder'
import { FakeSite, type SiteHandler } from '../test/fakeSite'
import { APP_HOST, FILES_HOST, ask, startRelay, until, type Answer, type Harness } from '../test/harness'
import { passClaims, ticketClaims, uploadTicketClaims } from '../test/signer'
import { makeUploadsOnDisk, type UploadsOnDisk } from '../test/uploadsOnDisk'

let disk: UploadsOnDisk
let folder: UploadFolder
let relay: Harness
let site: FakeSite | null = null

beforeAll(() => {
  disk = makeUploadsOnDisk()
  const opened = openUploadFolder(disk.root)
  if (!opened.ok) throw new Error(opened.problem)
  folder = opened.folder
})
afterAll(() => disk.remove())
afterEach(async () => {
  await site?.close()
  site = null
  await relay?.close()
})

const bare = (t: string) => `${RELAY_BARE_TICKET_PATH_PREFIX}${t}`
const askBare = (t: string, o: Parameters<typeof ask>[2] = {}) => ask(relay.port, bare(t), { host: APP_HOST, ...o })
const upload = (path: string, over: Record<string, unknown> = {}) => relay.signer.sign(uploadTicketClaims(path, disk.version(path), over))
const head = (over: Partial<FileServeHead> = {}): FileServeHead =>
  ({ status: 200, size: 5, contentType: 'text/markdown', purpose: 'preview', fileName: 'notes.md', ...over }) as FileServeHead

async function withSite(handler: SiteHandler, over: Parameters<typeof startRelay>[0] = {}) {
  relay = await startRelay({ uploads: folder, filesHost: null, ...over })
  site = await FakeSite.connect({ port: relay.port, pass: relay.signer.sign(passClaims()) }, handler)
  await until(() => relay.lines.current('site-1') !== null)
}

function expectNothingInline(a: Answer) {
  expect(a.headers['content-disposition']).toMatch(/^attachment;/)
  expect(a.headers['content-security-policy']).toBe('sandbox')
  expect(a.headers['x-content-type-options']).toBe('nosniff')
}

describe('an upload on the bare address @SC-1481', () => {
  it('sends a download as an attachment', async () => {
    relay = await startRelay({ uploads: folder, filesHost: null })
    const a = await askBare(upload('/files/task/t1/a1/notes.txt', { purpose: 'download' }))
    expect(a.status).toBe(200)
    expect(a.headers['content-type']).toBe('application/octet-stream')
    expectNothingInline(a)
  })

  it('sends a text preview as plain text, and a picture with its type, both as attachments', async () => {
    relay = await startRelay({ uploads: folder, filesHost: null })
    const text = await askBare(upload('/files/task/t1/a1/sub/deep.md'))
    expect(text.status).toBe(200)
    expect(text.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(text.body.toString()).toBe('# deep')
    expectNothingInline(text)
    const picture = await askBare(upload('/agents/ag1/images/face.png'))
    expect(picture.headers['content-type']).toBe('image/png')
    expectNothingInline(picture)
  })

  it('refuses a preview of a kind that needs a files address', async () => {
    relay = await startRelay({ uploads: folder, filesHost: null })
    const a = await askBare(upload('/files/task/t1/a1/report.pdf'))
    expect(a.status).toBe(403)
    expect(a.body.toString()).toMatch(/files address/)
    expect(a.body.toString()).not.toContain('%PDF')
    expect((await askBare(upload('/files/task/t1/a1/report.pdf', { purpose: 'download' }))).status).toBe(200)
  })
})

describe('a site\'s file on the bare address @SC-1482', () => {
  it('passes the ticket down the site\'s line and answers text as plain text, as an attachment', async () => {
    await withSite(() => ({ head: head(), body: new TextEncoder().encode('# hi!') }))
    const a = await askBare(relay.signer.sign(ticketClaims()))
    expect(a.status).toBe(200)
    expect(a.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(a.body.toString()).toBe('# hi!')
    expectNothingInline(a)
  })

  it('refuses an HTML preview\'s type and a PDF preview, and cancels the site\'s stream', async () => {
    let asked = 0
    await withSite(() => (++asked === 1
      ? { head: head({ contentType: 'text/html', fileName: 'page.html', size: 8 }), body: new TextEncoder().encode('<b>x</b>') }
      : { head: head({ contentType: 'application/pdf', fileName: 'q3.pdf', size: 100_000 }), body: new Uint8Array(1000), end: false }))
    const html = await askBare(relay.signer.sign(ticketClaims()))
    expect(html.headers['content-type']).toBe('text/plain; charset=utf-8')
    expectNothingInline(html)
    const pdf = await askBare(relay.signer.sign(ticketClaims()))
    expect(pdf.status).toBe(403)
    await until(() => site!.opened[1]?.cancelled === true)
  })

  it('sends a download as an attachment', async () => {
    await withSite(() => ({ head: head({ purpose: 'download', contentType: 'application/pdf', fileName: 'q3.pdf' }), body: new TextEncoder().encode('%PDF-') }))
    const a = await askBare(relay.signer.sign(ticketClaims({ purpose: 'download' })))
    expect(a.status).toBe(200)
    expect(a.headers['content-type']).toBe('application/octet-stream')
    expectNothingInline(a)
  })

  it('holds a person to the same limit', async () => {
    await withSite(() => ({ head: head(), body: new TextEncoder().encode('# hi!') }), { load: new Load(1) })
    relay.load.take('person-1')
    expect((await askBare(relay.signer.sign(ticketClaims()))).status).toBe(429)
  })
})

describe('where the bare door is answered @SC-1483', () => {
  it('only on the app\'s host: not on the files host, nor any other', async () => {
    relay = await startRelay({ uploads: folder })
    const t = upload('/files/task/t1/a1/notes.txt')
    expect((await ask(relay.port, bare(t), { host: FILES_HOST })).status).toBe(404)
    expect((await ask(relay.port, bare(t), { host: 'evil.example' })).status).toBe(404)
    expect((await ask(relay.port, bare(t), { host: `${APP_HOST}.evil.example` })).status).toBe(404)
    expect((await ask(relay.port, `/t/${t}`, { host: APP_HOST })).status).toBe(404)
    expect((await ask(relay.port, bare(t), { host: `${APP_HOST}:443` })).status).toBe(200)
  })

  it('nowhere without the app\'s origin', async () => {
    relay = await startRelay({ uploads: folder, appOrigin: null })
    expect((await askBare(upload('/files/task/t1/a1/notes.txt'))).status).toBe(404)
  })

  it('never for a path that is not a ticket under the prefix', async () => {
    relay = await startRelay({ uploads: folder })
    for (const path of ['/relay/', '/relay/t/', '/relay/t/abc', '/relay-line', '/relay/x/a.b.c']) {
      expect((await ask(relay.port, path, { host: APP_HOST })).status).toBe(404)
    }
  })
})

describe('the health path @SC-1470', () => {
  it('answers ok on any host, and nothing else', async () => {
    relay = await startRelay({ uploads: null, filesHost: null, appOrigin: null })
    for (const host of [FILES_HOST, APP_HOST, 'relay:4102', 'anything']) {
      const a = await ask(relay.port, '/health', { host })
      expect(a.status).toBe(200)
      expect(a.body.toString()).toBe('ok')
      expect(a.headers['content-type']).toBe('text/plain; charset=utf-8')
    }
    expect((await ask(relay.port, '/health', { method: 'HEAD' })).status).toBe(200)
    expect((await ask(relay.port, '/health', { method: 'POST' })).status).toBe(405)
    expect((await ask(relay.port, '/health/more')).status).toBe(404)
  })
})
