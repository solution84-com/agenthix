// The files hq keeps itself — a task's attachments and agents' pictures — open through hq's relay too, from hq's
// storage folder, on a ticket hq signs after checking access (spec part 1, *hq's relay*; part 6, V5 and V6). hq-server
// answers the request for a link and never the file. On hq's own address, the bare-address path serves downloads and
// text, and nothing inline.
//
// Runs after 08 on the pair 04-pairing left, or alone (`npx vitest run 09-upload-relay`), pairing its own default site.
import { beforeAll, describe, expect, it } from 'vitest'
import { hqDb } from './harness/db'
import { HQ_CLIENT_URL, PORTS } from './harness/env'
import { browserGet } from './harness/fileRelay'
import { MARKER, hq, hqAnswers, hqGet, putOnSite, stageFileRelay, type FileRelayStage } from './harness/fileRelaySetup'
import { ticketOf } from './harness/hqSigner'

const FILES_ORIGIN = `http://files.localhost:${PORTS.hqClient}`
const BARE = `${HQ_CLIENT_URL}/relay/t/`
const ATTACHMENT = `Handed back with the task.\n${MARKER}\n`
// A 1×1 PNG, with the marker in a text chunk after its header, so its bytes can be looked for too.
const ONE_PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const PNG_HEADER_BYTES = 33 // the signature and the IHDR chunk
const PNG = Buffer.concat([ONE_PIXEL.subarray(0, PNG_HEADER_BYTES), textChunk(MARKER), ONE_PIXEL.subarray(PNG_HEADER_BYTES)])

function textChunk(text: string): Buffer {
  const data = Buffer.from(`Comment\0${text}`, 'latin1')
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write('tEXt', 4, 'latin1')
  // The decoder in a browser checks the CRC; nothing here decodes the picture, so it is left zero.
  return Buffer.concat([head, data, Buffer.alloc(4)])
}

let stage: FileRelayStage
let attachmentPath: string
let picturePath: string

async function link(path: string, token: string | undefined, download = false): Promise<{ status: number; url?: string }> {
  const answer = await hqGet(`/file-link?path=${encodeURIComponent(path)}${download ? '&download=1' : ''}`, token)
  return { status: answer.status, ...(answer.status === 200 ? { url: JSON.parse(answer.text).url as string } : {}) }
}

beforeAll(async () => {
  stage = await stageFileRelay('Uploads Through The Relay')
  const task = await hq('create-task', { projectId: stage.project.id, title: 'Cross-App Attachment' }, stage.admin)
  expect(task.status, JSON.stringify(task.json)).toBe(200)
  const uploaded = await hq('upload-task-attachment', {
    taskId: task.json.id, filename: 'handback.txt', dataUrl: `data:text/plain;base64,${Buffer.from(ATTACHMENT).toString('base64')}`,
  }, stage.admin)
  expect(uploaded.status, JSON.stringify(uploaded.json)).toBe(200)
  attachmentPath = uploaded.json.path

  const agent = await hq('create-agent', { name: 'Cross-App Picture Agent', handle: `crossapp-picture-${Date.now().toString(36)}` }, stage.admin)
  expect(agent.status, JSON.stringify(agent.json)).toBe(200)
  const picture = await hq('upload-agent-image', { agentId: agent.json.id, type: 'avatar', dataUrl: `data:image/png;base64,${PNG.toString('base64')}` }, stage.admin)
  expect(picture.status, JSON.stringify(picture.json)).toBe(200)
  picturePath = picture.json.url
  // A place's file, for the bare-address path's rule on a site's file too.
  putOnSite(stage.project.id, 'files', 'bare/notes.txt', `Plain notes.\n${MARKER}\n`)
  putOnSite(stage.project.id, 'files', 'bare/page.html', `<script>alert('${MARKER}')</script>`)
  putOnSite(stage.project.id, 'files', 'bare/manual.pdf', `%PDF-1.4\n% ${MARKER}\n%%EOF\n`)
}, 600_000)

describe("hq's uploads open through hq's relay", () => {
  it("V6: a task's attachment opens for a member of its project from hq's storage, and the link is recorded @SC-1572 @SC-1577", async () => {
    const before = await hqDb.fileOpened.count({ where: { space: 'upload', path: decodeURI(attachmentPath) } })
    const preview = await link(attachmentPath, stage.admin)
    expect(preview.status).toBe(200)
    expect(preview.url!.startsWith(`${FILES_ORIGIN}/t/`)).toBe(true)
    const shown = await browserGet(preview.url!, { Origin: HQ_CLIENT_URL })
    expect(shown.status).toBe(200)
    expect(shown.body.toString()).toBe(ATTACHMENT)
    expect(shown.headers['content-security-policy']).toBe('sandbox')
    expect(shown.headers['x-content-type-options']).toBe('nosniff')
    expect(shown.headers['referrer-policy']).toBe('no-referrer')
    expect(shown.headers['access-control-allow-origin']).toBe(HQ_CLIENT_URL)
    expect(shown.headers['content-disposition']).toMatch(/^inline/)

    const download = await link(attachmentPath, stage.admin, true)
    const saved = await browserGet(download.url!)
    expect(saved.status).toBe(200)
    expect(saved.headers['content-disposition']).toMatch(/^attachment; filename="handback.txt"/)
    expect(saved.body.toString()).toBe(ATTACHMENT)
    const part = await browserGet(download.url!, { Range: 'bytes=0-6' })
    expect(part.status).toBe(206)
    expect(part.body.toString()).toBe('Handed ')
    expect(await hqDb.fileOpened.count({ where: { space: 'upload', path: decodeURI(attachmentPath) } })).toBe(before + 2)
  })

  it("V6: an agent's picture opens as a picture, inline on the files address @SC-1577", async () => {
    const preview = await link(picturePath, stage.operator)
    expect(preview.status).toBe(200)
    const shown = await browserGet(preview.url!)
    expect(shown.status).toBe(200)
    // hq re-encodes every uploaded picture as WebP (generated avatars and covers spec, *Upload*).
    expect(shown.headers['content-type']).toBe('image/webp')
    expect(shown.body.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(shown.body.subarray(8, 12).toString('ascii')).toBe('WEBP')
  })

  it('V6: someone outside the project gets no link to its attachment, and no session gets none to a picture @SC-1577', async () => {
    expect((await link(attachmentPath, stage.operator)).status).toBe(404)
    expect((await link(attachmentPath, undefined)).status).toBe(401)
    expect((await link(picturePath, undefined)).status).toBe(401)
    expect((await link('/files/task/../../secrets.json', stage.admin)).status).toBe(404)
  })

  it('V5: hq-server answers no upload path with the file, signed in or not @SC-1577', async () => {
    for (const path of [attachmentPath, picturePath]) {
      for (const token of [stage.admin, undefined]) {
        const answer = await hqGet(path, token)
        expect(answer.status, `${path} ${token ? 'signed in' : 'no session'}`).not.toBe(200)
        expect(answer.text).not.toContain(MARKER)
      }
      // hq's web page, on its own name and on the files name, has no route to it either.
      for (const origin of [HQ_CLIENT_URL, FILES_ORIGIN]) {
        const answer = await browserGet(`${origin}${path}`)
        expect(answer.body.toString('latin1'), `${origin}${path}`).not.toContain(MARKER)
      }
    }
  })
})

describe("the bare-address path on hq's own address", () => {
  it('V6: serves a download and text, as attachments, and never anything inline @SC-1577', async () => {
    const download = await link(attachmentPath, stage.admin, true)
    const saved = await browserGet(`${BARE}${ticketOf(download.url!)}`)
    expect(saved.status).toBe(200)
    expect(saved.headers['content-disposition']).toMatch(/^attachment/)
    expect(saved.body.toString()).toBe(ATTACHMENT)

    const preview = await link(attachmentPath, stage.admin)
    const text = await browserGet(`${BARE}${ticketOf(preview.url!)}`)
    expect(text.status).toBe(200)
    expect(text.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(text.headers['content-disposition']).toMatch(/^attachment/)

    const notes = await hq('open-file', { file: { space: 'place', loc: { ownerType: 'project', ownerId: stage.project.id }, path: 'bare/notes.txt' } }, stage.admin)
    const siteText = await browserGet(`${BARE}${ticketOf(notes.json.previewLink)}`)
    expect(siteText.status).toBe(200)
    expect(siteText.headers['content-disposition']).toMatch(/^attachment/)
    expect(siteText.body.toString()).toContain(MARKER)
  })

  it('V6 V11: an HTML preview there is plain text to save, and a PDF preview is refused @SC-1568', async () => {
    const page = await hq('open-file', { file: { space: 'place', loc: { ownerType: 'project', ownerId: stage.project.id }, path: 'bare/page.html' } }, stage.admin)
    const html = await browserGet(`${BARE}${ticketOf(page.json.previewLink)}`)
    expect(html.status).toBe(200)
    expect(html.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(html.headers['content-disposition']).toMatch(/^attachment/)
    expect(html.headers['content-security-policy']).toBe('sandbox')

    const pdf = await hq('open-file', { file: { space: 'place', loc: { ownerType: 'project', ownerId: stage.project.id }, path: 'bare/manual.pdf' } }, stage.admin)
    const refused = await browserGet(`${BARE}${ticketOf(pdf.json.previewLink)}`)
    expect(refused.status).toBe(403)
    expect(refused.body.toString()).not.toContain(MARKER)
  })
})

describe('no file byte passes through hq-server', () => {
  it("V5: no answer hq-server gave this file carries an upload's or a file's content @SC-1577", () => {
    expect(hqAnswers.length).toBeGreaterThan(10)
    const pictureBase64 = PNG.toString('base64')
    for (const body of hqAnswers) {
      expect(body).not.toContain(MARKER)
      expect(body).not.toContain(pictureBase64)
    }
  })
})
