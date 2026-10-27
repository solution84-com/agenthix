/**
 * The whole path in one process: a site on the relay's line that verifies the ticket as a real site does and serves a
 * file's bytes by range, and a browser asking the relay for it.
 */
import { createHash, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FILE_TICKET_TOKEN_TYPE, parseByteRange, refusalHead, verifyRelayToken, type FileServeHead, type FilesServeParams,
} from '@agenthix/core'
import { FakeSite } from '../test/fakeSite'
import { ask, startRelay, until, type Harness } from '../test/harness'
import { passClaims, ticketClaims } from '../test/signer'

const FILE = randomBytes(3 * 1024 * 1024 + 123)
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

let relay: Harness
let site: FakeSite
afterEach(async () => {
  await site?.close()
  await relay?.close()
})

async function realisticSite() {
  relay = await startRelay()
  site = await FakeSite.connect({ port: relay.port, pass: relay.signer.sign(passClaims()) }, async raw => {
    const params = raw as FilesServeParams
    const verdict = await verifyRelayToken(params.ticket, {
      type: FILE_TICKET_TOKEN_TYPE, keys: relay.signer.keys, audience: 'site-1', relay: 'relay-1', nowMs: Date.now(),
    })
    if (!verdict.ok) return { head: refusalHead(verdict.refusal === 'expired' ? 'ticket-expired' : 'ticket-invalid') }
    const range = parseByteRange(params.range, FILE.length)
    if (range === 'unsatisfiable') return { head: refusalHead('range-not-satisfiable', FILE.length) }
    const base = { size: FILE.length, contentType: 'application/pdf', purpose: verdict.claims.purpose, fileName: 'q3.pdf' }
    const head: FileServeHead = range ? { ...base, status: 206, range } : { ...base, status: 200 }
    if (params.headOnly) return { head }
    return { head, body: range ? FILE.subarray(range.start, range.end + 1) : FILE }
  })
  await until(() => relay.lines.current('site-1') !== null)
}

describe('a ranged download, end to end @SC-1485', () => {
  it('serves the whole file, then any range of it, as the site cut it', async () => {
    await realisticSite()
    const t = relay.signer.sign(ticketClaims({ purpose: 'download' }))
    const whole = await ask(relay.port, `/t/${t}`)
    expect(whole.status).toBe(200)
    expect(whole.headers['content-length']).toBe(String(FILE.length))
    expect(whole.headers['content-disposition']).toMatch(/^attachment; filename="q3.pdf"/)
    expect(sha(whole.body)).toBe(sha(FILE))

    const middle = await ask(relay.port, `/t/${t}`, { headers: { Range: 'bytes=1000000-2000000' } })
    expect(middle.status).toBe(206)
    expect(middle.headers['content-range']).toBe(`bytes 1000000-2000000/${FILE.length}`)
    expect(sha(middle.body)).toBe(sha(FILE.subarray(1_000_000, 2_000_001)))

    const tail = await ask(relay.port, `/t/${t}`, { headers: { Range: 'bytes=-10' } })
    expect(tail.body.equals(FILE.subarray(FILE.length - 10))).toBe(true)

    const past = await ask(relay.port, `/t/${t}`, { headers: { Range: `bytes=${FILE.length}-` } })
    expect(past.status).toBe(416)
    expect(past.headers['content-range']).toBe(`bytes */${FILE.length}`)
    expect(relay.load.bytesCarried).toBe(FILE.length + 1_000_001 + 10)
    await until(() => relay.load.openStreams === 0)
  })

  it('carries the site\'s refusal of a ticket made for another relay', async () => {
    await realisticSite()
    const a = await ask(relay.port, `/t/${relay.signer.sign(ticketClaims({ relay: 'relay-2' }))}`)
    expect(a.status).toBe(403)
    expect(a.body.toString()).toMatch(/not valid/)
  })
})
