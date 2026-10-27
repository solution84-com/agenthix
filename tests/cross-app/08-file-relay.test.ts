// Opening a place's file through hq's relay, with hq, its site and hq's relay running (spec part 1, *Opening a file*;
// part 6, *How it's proved*). A person opens a file with hq's `openFile`: hq checks access, asks the site about the
// file, signs a preview and a download ticket and records each; the browser fetches the links on files.localhost, which
// hq's web page passes to the relay, which passes them down the line the site holds to it; the site checks the ticket
// and serves the bytes. Tickets altered, signed by another key, expired or naming another site are refused, and the
// relay takes a site's line only with hq's pass.
//
// Runs after 07 on the pair 04-pairing left, or alone (`npx vitest run 08-file-relay`), pairing its own default site.
import { randomUUID } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { HQ_TOKEN_ISSUER, RELAY_PASS_TOKEN_TYPE } from '../../core/dist/index.js'
import { hqDb } from './harness/db'
import { HQ_CLIENT_URL, HQ_URL, PORTS } from './harness/env'
import { browserGet, dialLine } from './harness/fileRelay'
import { MARKER, hq, hqAnswers, putOnSite, stageFileRelay, type FileRelayStage } from './harness/fileRelaySetup'
import { altered, claimsOf, hqSigningKey, signToken, strangerKey, ticketOf } from './harness/hqSigner'
import { op } from './harness/hqApi'

const FILES_ORIGIN = `http://files.localhost:${PORTS.hqClient}`
const TEXT = `Notes kept by an agent.\n${MARKER}\n${'line of the report\n'.repeat(200)}`

let stage: FileRelayStage
let notesPath: string

type Ready = { state: 'ready'; facts: { name: string; size: number; kind: string; version: string }; previewLink: string; downloadLink: string; expiresAt: number }

async function open(file: unknown, token = stage.admin): Promise<{ state: string } & Partial<Ready>> {
  const answer = await hq('open-file', { file }, token)
  expect(answer.status, JSON.stringify(answer.json)).toBe(200)
  return answer.json
}

const placeFile = (path: string) => ({ space: 'place', loc: { ownerType: 'project', ownerId: stage.project.id }, path })

async function openReady(file: unknown): Promise<Ready> {
  const answer = await open(file)
  expect(answer.state, JSON.stringify(answer)).toBe('ready')
  return answer as Ready
}

function expectSafetyHeaders(headers: Record<string, string>): void {
  expect(headers['content-security-policy']).toBe('sandbox')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
}

beforeAll(async () => {
  stage = await stageFileRelay('Files Through The Relay')
  notesPath = putOnSite(stage.project.id, 'files', 'reports/notes.txt', TEXT)
  putOnSite(stage.project.id, 'files', 'reports/page.html', `<html><body><script>document.title='${MARKER}'</script></body></html>`)
  putOnSite(stage.project.id, 'files', 'reports/manual.pdf', `%PDF-1.4\n% ${MARKER}\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n`)
  putOnSite(stage.project.id, 'artefacts', 'summary.md', `# Summary\n\n${MARKER} in an artefact.\n`)
  const saved = await op(HQ_URL, 'save-knowledge-page', {
    owner: { ownerType: 'project', ownerId: stage.project.id }, page: 'notes/relay.md',
    content: `---\ntitle: Relay\ndescription: How files reach a browser.\n---\n\n${MARKER} in a page.\n`, baseVersion: null,
  }, stage.admin)
  expect(saved.json?.outcome, JSON.stringify(saved.json)).toBe('done')
}, 600_000)

describe("a place's file opens through hq's relay", () => {
  it('V1 V5: a member opens it — hq answers the facts and two links on the files address, and records both tickets @SC-1564 @SC-1572 @SC-1575', async () => {
    const before = await hqDb.fileOpened.count({ where: { path: 'reports/notes.txt' } })
    const answer = await openReady(placeFile('reports/notes.txt'))
    expect(answer.facts).toMatchObject({ name: 'notes.txt', size: Buffer.byteLength(TEXT), kind: 'text' })
    expect(answer.previewLink.startsWith(`${FILES_ORIGIN}/t/`)).toBe(true)
    expect(answer.downloadLink.startsWith(`${FILES_ORIGIN}/t/`)).toBe(true)
    const rows = await hqDb.fileOpened.findMany({ where: { path: 'reports/notes.txt' }, orderBy: { openedAt: 'asc' } })
    expect(rows.length - before).toBe(2)
    expect(rows.slice(-2).map((r: { purpose: string }) => r.purpose).sort()).toEqual(['download', 'preview'])
    expect(rows.at(-1)).toMatchObject({ space: 'place', ownerType: 'project', ownerId: stage.project.id, siteId: stage.siteId, relayId: stage.relayId, version: answer.facts.version })
    // The ticket names this file, this person, this site and this relay.
    expect(claimsOf(ticketOf(answer.previewLink))).toMatchObject({ purpose: 'preview', site: stage.siteId, aud: stage.siteId, relay: stage.relayId, path: 'reports/notes.txt' })
  })

  it('V2 V3: the preview link serves the bytes inline, with the sandbox, nosniff, no-referrer and CORS for hq only; the download link as an attachment @SC-1568 @SC-1569 @SC-1576', async () => {
    const answer = await openReady(placeFile('reports/notes.txt'))
    const preview = await browserGet(answer.previewLink, { Origin: HQ_CLIENT_URL })
    expect(preview.status, preview.body.toString()).toBe(200)
    expect(preview.body.toString()).toBe(TEXT)
    expectSafetyHeaders(preview.headers)
    expect(preview.headers['access-control-allow-origin']).toBe(HQ_CLIENT_URL)
    expect(preview.headers['access-control-allow-credentials']).toBeUndefined()
    expect(preview.headers['content-disposition']).toMatch(/^inline; filename="notes.txt"/)
    expect(preview.headers['content-type']).toMatch(/^text\/plain/)

    const elsewhere = await browserGet(answer.previewLink, { Origin: 'http://elsewhere.example' })
    expect(elsewhere.status).toBe(200)
    expect(elsewhere.headers['access-control-allow-origin']).toBeUndefined()

    const download = await browserGet(answer.downloadLink)
    expect(download.status).toBe(200)
    expect(download.body.toString()).toBe(TEXT)
    expectSafetyHeaders(download.headers)
    expect(download.headers['content-disposition']).toMatch(/^attachment; filename="notes.txt"/)
    expect(download.headers['content-type']).toBe('application/octet-stream')
  })

  it('V2: a range is served as 206 with its bytes, and a HEAD answers the size with no body @SC-1576', async () => {
    const answer = await openReady(placeFile('reports/notes.txt'))
    const part = await browserGet(answer.previewLink, { Range: 'bytes=0-22' })
    expect(part.status).toBe(206)
    expect(part.headers['content-range']).toBe(`bytes 0-22/${Buffer.byteLength(TEXT)}`)
    expect(part.body.toString()).toBe(TEXT.slice(0, 23))

    const head = await browserGet(answer.downloadLink, {}, 'HEAD')
    expect(head.status).toBe(200)
    expect(head.headers['content-length']).toBe(String(Buffer.byteLength(TEXT)))
    expect(head.body.length).toBe(0)
  })

  it('V11: an HTML file and a PDF are served on the files address only, under the sandbox @SC-1568 @SC-1576', async () => {
    const page = await openReady(placeFile('reports/page.html'))
    const html = await browserGet(page.previewLink)
    expect(html.status).toBe(200)
    expectSafetyHeaders(html.headers)
    const pdf = await openReady(placeFile('reports/manual.pdf'))
    expect(pdf.facts.kind).toBe('pdf')
    const viewed = await browserGet(pdf.previewLink, { Range: 'bytes=0-7' })
    expect(viewed.status).toBe(206)
    expect(viewed.body.toString()).toBe('%PDF-1.4')
    expect(viewed.headers['content-type']).toBe('application/pdf')
    expectSafetyHeaders(viewed.headers)
  })

  it('V1: a file changed after its ticket was signed answers 409, and its bytes are not sent @SC-1563', async () => {
    const answer = await openReady(placeFile('reports/notes.txt'))
    appendFileSync(notesPath, 'a line added later\n')
    const refused = await browserGet(answer.previewLink)
    expect(refused.status).toBe(409)
    expect(refused.body.toString()).not.toContain(MARKER)
  })
})

describe('a ticket hq did not sign for that file is refused', () => {
  it('V1 V2: altered, signed by another key, expired, for another site or through another relay — none gets a byte @SC-1562', async () => {
    const answer = await openReady(placeFile('reports/notes.txt'))
    const ticket = ticketOf(answer.previewLink)
    const claims = claimsOf(ticket)
    const hqKey = await hqSigningKey()
    const otherSite = randomUUID()
    const now = Math.floor(Date.now() / 1000)
    const cases: Array<[string, string, number]> = [
      ['altered to another path, signature kept', altered(ticket, { path: 'reports/page.html' }), 403],
      ['signed by a key hq never held', signToken(claims, strangerKey(hqKey.kid)), 403],
      ['expired', signToken({ ...claims, iat: now - 600, exp: now - 60 }, hqKey), 403],
      // The relay has no line from a site it was not assigned, so it reaches no site at all.
      ['for a site not on this relay', signToken({ ...claims, site: otherSite, aud: otherSite }, hqKey), 503],
      ['addressed to another site, routed to this one', signToken({ ...claims, aud: otherSite }, hqKey), 403],
      ['through another relay', signToken({ ...claims, relay: randomUUID() }, hqKey), 403],
    ]
    // The genuine ticket still works, so each refusal is the change alone.
    expect((await browserGet(`${FILES_ORIGIN}/t/${signToken(claims, hqKey)}`)).status).toBe(200)
    for (const [what, forged, status] of cases) {
      const got = await browserGet(`${FILES_ORIGIN}/t/${forged}`)
      expect(got.status, what).toBe(status)
      expect(got.body.toString(), what).not.toContain(MARKER)
      expectSafetyHeaders(got.headers)
    }
  })

  it("V4: the relay takes a site's line only with hq's pass, for that site and this relay @SC-1562 @SC-1565", async () => {
    const hqKey = await hqSigningKey()
    const now = Math.floor(Date.now() / 1000)
    const pass = (over: Record<string, unknown>) => ({
      tokenType: RELAY_PASS_TOKEN_TYPE, iss: HQ_TOKEN_ISSUER, sub: stage.siteId, aud: stage.relayId, iat: now, exp: now + 300, ...over,
    })
    // A site id no site holds, so that taking the line would not replace the default site's.
    const stranger = `cross-app-${randomUUID()}`
    expect(await dialLine(stranger, null)).toBe(401)
    expect(await dialLine(stranger, signToken(pass({ sub: stranger }), strangerKey(hqKey.kid)))).toBe(401)
    expect(await dialLine(stranger, signToken(pass({ sub: stranger, aud: randomUUID() }), hqKey))).toBe(401)
    expect(await dialLine(stranger, signToken(pass({ sub: stranger, exp: now - 60 }), hqKey))).toBe(401)
    // The default site's own pass, presented for another site.
    expect(await dialLine(stranger, signToken(pass({}), hqKey))).toBe(401)
  })
})

describe('other spaces, and people outside the place', () => {
  it('V2: an artefact and a knowledge page open and download through the relay @SC-1575', async () => {
    const artefact = await openReady({ space: 'artefact', owner: { ownerType: 'project', ownerId: stage.project.id }, name: 'summary.md' })
    expect(artefact.facts.kind).toBe('markdown')
    const shown = await browserGet(artefact.previewLink)
    expect(shown.status).toBe(200)
    expect(shown.body.toString()).toContain(`${MARKER} in an artefact.`)

    const page = await openReady({ space: 'knowledge', owner: { ownerType: 'project', ownerId: stage.project.id }, path: 'notes/relay.md' })
    const saved = await browserGet(page.downloadLink)
    expect(saved.status).toBe(200)
    expect(saved.headers['content-disposition']).toMatch(/^attachment; filename="relay.md"/)
    expect(saved.body.toString()).toContain(`${MARKER} in a page.`)
  })

  it('V9: someone outside the place gets not-found, whether the file exists or not, and nothing is signed for them @SC-1575', async () => {
    const identity = await hqDb.authIdentity.findFirstOrThrow({ where: { providerName: 'username', providerUserId: 'e2e-operator' }, include: { auth: true } })
    const operator = { id: identity.auth.userId as string }
    expect(await open(placeFile('reports/notes.txt'), stage.operator)).toEqual({ state: 'not-found' })
    expect(await open(placeFile('reports/none.txt'), stage.operator)).toEqual({ state: 'not-found' })
    expect(await open({ space: 'artefact', owner: { ownerType: 'project', ownerId: stage.project.id }, name: 'summary.md' }, stage.operator)).toEqual({ state: 'not-found' })
    expect(await hqDb.fileOpened.count({ where: { personId: operator.id } })).toBe(0)
    // A member asking for a file that is not there is told the same.
    expect(await open(placeFile('reports/none.txt'))).toEqual({ state: 'not-found' })
  })
})

describe('no file byte passes through hq-server', () => {
  it('V5: no answer hq-server gave this file carries any file\'s content @SC-1575', () => {
    expect(hqAnswers.length).toBeGreaterThan(10)
    for (const body of hqAnswers) expect(body).not.toContain(MARKER)
  })
})
