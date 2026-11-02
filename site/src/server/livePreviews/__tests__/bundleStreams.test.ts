/**
 * A bundle's bytes on a relay's line: each end verifies the ticket as the end it is and takes it once; the
 * destination reads the source's head the relay sends first, and keeps the bytes only when their size and SHA-256 are
 * the ticket's. A refusal leaves nothing.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Duplex } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import { BUNDLE_TICKET_TOKEN_TYPE, HQ_TOKEN_ISSUER, createBundleReadHeadReader, createBundleWriteHeadReader, encodeBundleReadHead } from '@agenthix/core'
import { fixedKeys, makeKey, signToken } from '../../relay/__tests__/ticketKit'
import type { ContentStream } from '../../hq/content/contentStream'

vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: { sendEvent: () => {} } }))

const { createBundleRead, createBundleWrite, forgetTakenTicketsForTests } = await import('../bundles/bundleStreams')
const { bundleFile, freshBundleDir } = await import('../bundles/bundleStore')

const key = makeKey('k1')
const keys = fixedKeys({ keys: [key.jwk] })
const BUNDLE = '33333333-3333-4333-8333-333333333333'
const BYTES = Buffer.from('a git bundle, as it would arrive')
const SHA = createHash('sha256').update(BYTES).digest('hex')

function ticket(over: Record<string, unknown> = {}): string {
  const iat = Math.floor(Date.now() / 1000)
  return signToken(key, {
    iss: HQ_TOKEN_ISSUER, aud: 'relay-1', iat, exp: iat + 300, tokenType: BUNDLE_TICKET_TOKEN_TYPE, jti: `${Math.random().toString(36).slice(2)}aaaaaaaaaaaaaaaaaaaaaaaa`,
    relay: 'relay-1', person: 'p1', bundleId: BUNDLE, direction: 'toPreview', workspaceId: 'w1', branch: 'login-page',
    from: { site: 'site-a' }, to: { site: 'site-b' }, sha256: SHA, size: BYTES.length, ...over,
  })
}

/** A stream as a relay's line gives it: what the relay sent, ended; what the handler answered, collected. */
function stream(sent: Buffer[]): { stream: ContentStream; answered: () => Buffer } {
  const out: Buffer[] = []
  const d = new Duplex({
    read() {},
    write(chunk, _e, cb) { out.push(Buffer.from(chunk)); cb() },
    final(cb) { cb() },
  })
  setTimeout(() => { for (const b of sent) d.push(b); d.push(null) }, 0)
  return { stream: d as unknown as ContentStream, answered: () => Buffer.concat(out) }
}

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-streams-'))
  process.env.SITE_ROOT = root
  forgetTakenTicketsForTests()
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

const landed: unknown[] = []
const writer = (siteId = 'site-b') => createBundleWrite({ siteId, relayId: 'relay-1', keys, tell: e => { landed.push(e) } })
const readHead = (b: Buffer) => { const r = createBundleWriteHeadReader().push(new Uint8Array(b)); return r.state === 'head' ? r.head : null }

withFeature('livePreview', () => {
  describe('bundle.write @SC-1740', () => {
    it('keeps the bytes after the source\'s head when they are the ticket\'s', async () => {
      const t = ticket()
      const s = stream([Buffer.from(encodeBundleReadHead({ ok: true, size: BYTES.length })), BYTES])
      await writer()(s.stream, { ticket: t })
      expect(readHead(s.answered())).toEqual({ ok: true, sha256: SHA, size: BYTES.length })
      expect(fs.readFileSync(bundleFile(BUNDLE))).toEqual(BYTES)
    })

    it('keeps nothing when the bytes are not the ticket\'s', async () => {
      const s = stream([Buffer.from(encodeBundleReadHead({ ok: true, size: BYTES.length })), Buffer.from('another bundle of the same..!')])
      await writer()(s.stream, { ticket: ticket() })
      expect(readHead(s.answered())).toEqual({ ok: false, refusal: 'hash-mismatch' })
      expect(fs.existsSync(bundleFile(BUNDLE))).toBe(false)
    })

    it('refuses a ticket twice, and a ticket for which this site is not the destination', async () => {
      const t = ticket()
      const send = () => stream([Buffer.from(encodeBundleReadHead({ ok: true, size: BYTES.length })), BYTES])
      await writer()(send().stream, { ticket: t })
      const again = send()
      await writer()(again.stream, { ticket: t })
      expect(readHead(again.answered())).toEqual({ ok: false, refusal: 'ticket-used' })
      const wrongEnd = send()
      await writer('site-a')(wrongEnd.stream, { ticket: ticket() })
      expect(readHead(wrongEnd.answered())).toEqual({ ok: false, refusal: 'ticket-invalid' })
    })

    it('keeps nothing more than the ticket\'s size', async () => {
      const s = stream([Buffer.from(encodeBundleReadHead({ ok: true, size: BYTES.length })), BYTES, Buffer.from('more')])
      await writer()(s.stream, { ticket: ticket() })
      expect(readHead(s.answered())).toEqual({ ok: false, refusal: 'too-large' })
      expect(fs.existsSync(bundleFile(BUNDLE))).toBe(false)
    })
  })

  describe('bundle.read @SC-1740', () => {
    it('sends the bundle it holds after its head, once per ticket, only as the source', async () => {
      await freshBundleDir(BUNDLE)
      fs.writeFileSync(bundleFile(BUNDLE), BYTES)
      const reader = createBundleRead({ siteId: 'site-a', relayId: 'relay-1', keys })
      const t = ticket()
      const s = stream([])
      await reader(s.stream, { ticket: t })
      const read = createBundleReadHeadReader().push(new Uint8Array(s.answered()))
      expect(read.state === 'head' && read.head).toEqual({ ok: true, size: BYTES.length })
      expect(read.state === 'head' && Buffer.from(read.rest)).toEqual(BYTES)
      const again = stream([])
      await reader(again.stream, { ticket: t })
      const refused = createBundleReadHeadReader().push(new Uint8Array(again.answered()))
      expect(refused.state === 'head' && refused.head).toEqual({ ok: false, refusal: 'ticket-used' })
    })
  })
})
