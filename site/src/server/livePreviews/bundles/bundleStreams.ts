/**
 * A Git bundle's bytes on a relay's line (live preview spec section 5, *On another site*): `bundle.read` on the source
 * site and `bundle.write` on the destination's. The site trusts nothing the relay says. Each end verifies the bundle
 * ticket itself (`verifyRelayToken`: hq's signature, its life, the line's relay, and that this site is the end it is
 * asked as), and takes it once by its `jti`.
 *
 * On `bundle.write` the relay sends the source's `BundleReadHead` first, then the bytes, then ends its half. The
 * destination reads that head, checks the ticket, writes the bytes to a file of its own under a name nothing else
 * uses, and keeps it as the bundle only when its size and SHA-256 are the ticket's. A refusal or a broken stream leaves
 * nothing. Whatever the outcome, hq is told (`bundle.landed`). Nothing here logs a ticket.
 */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import {
  BUNDLE_EVENTS, BUNDLE_MAX_BYTES, BUNDLE_TICKET_TOKEN_TYPE, createBundleReadHeadReader, encodeBundleReadHead,
  encodeBundleWriteHead, verifyRelayToken,
  type BundleReadHead, type BundleServeRefusal, type BundleTicketClaims, type BundleWriteHead,
} from '@agenthix/core'
import type { ContentStream } from '../../hq/content/contentStream'
import type { ContentHandler } from '../../hq/content/contentMethods'
import type { KeySetSource } from '../../relay/hqKeySet'
import { hqConnectionManager } from '../../hq/hqConnection'
import { Logger } from '../../utils/logger'
import { bundleDir, bundleFile, bundleSize, freshBundleDir, hashFile, incomingFile } from './bundleStore'

const logger = new Logger('bundles')

export type BundleStreamOptions = {
  siteId: string
  relayId: string
  keys: KeySetSource
  now?: () => number
  tell?: (event: { transferId: string; bundleId: string; result: BundleWriteHead; at: string }) => void
}

/** Ticket ids this site has taken, each kept until its ticket would expire anyway. */
const taken = new Map<string, number>()

function takeOnce(jti: string, expMs: number, now: number): boolean {
  for (const [k, until] of taken) if (until <= now) taken.delete(k)
  if (taken.has(jti)) return false
  taken.set(jti, expMs)
  return true
}

export function forgetTakenTicketsForTests(): void {
  taken.clear()
}

function readTicket(params: unknown): string | null {
  const t = (params as { ticket?: unknown } | null)?.ticket
  return typeof t === 'string' && t.length > 0 && t.length <= 16 * 1024 ? t : null
}

async function verify(ticket: string, side: 'from' | 'to', o: BundleStreamOptions): Promise<BundleTicketClaims | BundleServeRefusal> {
  const check = async () => verifyRelayToken(ticket, {
    type: BUNDLE_TICKET_TOKEN_TYPE, keys: await o.keys.get(), audience: o.siteId, relay: o.relayId, side, nowMs: (o.now ?? Date.now)(),
  })
  let verdict = await check()
  if (!verdict.ok && verdict.refusal === 'unknown-key' && (await o.keys.refresh())) verdict = await check()
  if (verdict.ok) return verdict.claims
  logger.warn(`A bundle stream refused a ticket: ${verdict.refusal}`)
  return verdict.refusal === 'expired' ? 'ticket-expired' : 'ticket-invalid'
}

function endWith(stream: ContentStream, bytes: Uint8Array): Promise<void> {
  return new Promise(resolve => {
    if (stream.destroyed || stream.writableEnded) return resolve()
    stream.once('close', () => resolve())
    stream.end(Buffer.from(bytes), () => resolve())
  })
}

const refuseRead = (stream: ContentStream, refusal: BundleServeRefusal) => endWith(stream, encodeBundleReadHead({ ok: false, refusal }))

export function createBundleRead(o: BundleStreamOptions): ContentHandler {
  return async (stream, params) => {
    const ticket = readTicket(params)
    if (!ticket) return refuseRead(stream, 'ticket-invalid')
    const claims = await verify(ticket, 'from', o).catch(() => 'failed' as const)
    if (typeof claims === 'string') return refuseRead(stream, claims)
    if (!takeOnce(claims.jti, claims.exp * 1000, (o.now ?? Date.now)())) return refuseRead(stream, 'ticket-used')
    const size = await bundleSize(claims.bundleId).catch(() => null)
    if (size === null) return refuseRead(stream, 'not-found')
    const hashed = await hashFile(bundleFile(claims.bundleId)).catch(() => null)
    if (!hashed || hashed.size !== claims.size || hashed.sha256 !== claims.sha256) return refuseRead(stream, 'hash-mismatch')
    stream.write(Buffer.from(encodeBundleReadHead({ ok: true, size })))
    await new Promise<void>(resolve => {
      const file = createReadStream(bundleFile(claims.bundleId))
      file.on('error', () => { stream.destroy(); resolve() })
      stream.on('close', () => { file.destroy(); resolve() })
      file.pipe(stream)
      file.on('end', () => resolve())
    })
  }
}

type Reading = { head: BundleReadHead; rest: Buffer } | null

/** The source's head the relay sends first; null when the stream ends or breaks before it, or it does not read. */
function readSourceHead(stream: ContentStream): Promise<Reading> {
  return new Promise(resolve => {
    const reader = createBundleReadHeadReader()
    const done = (r: Reading) => {
      stream.removeListener('data', onData)
      stream.removeListener('end', onEnd)
      stream.removeListener('close', onEnd)
      if (r) stream.pause()
      resolve(r)
    }
    const onData = (chunk: Buffer) => {
      const read = reader.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
      if (read.state === 'need-more') return
      done(read.state === 'head' ? { head: read.head, rest: Buffer.from(read.rest) } : null)
    }
    const onEnd = () => done(null)
    stream.on('data', onData)
    stream.once('end', onEnd)
    stream.once('close', onEnd)
  })
}

/** Writes the bytes after the head to `file`, at most `limit` of them; their SHA-256 and size, or why not. */
function receive(stream: ContentStream, first: Buffer, file: string, limit: number): Promise<{ sha256: string; size: number } | BundleServeRefusal> {
  return new Promise(resolve => {
    const hash = createHash('sha256')
    const out = createWriteStream(file, { flags: 'wx', mode: 0o640 })
    let size = 0
    let settled = false
    const finish = (r: { sha256: string; size: number } | BundleServeRefusal) => {
      if (settled) return
      settled = true
      if (typeof r === 'string') out.destroy()
      resolve(r)
    }
    const take = (chunk: Buffer): boolean => {
      size += chunk.length
      if (size > limit) {
        // The rest is dropped as it comes; the answer still goes back on this stream.
        finish('too-large')
        return false
      }
      hash.update(chunk)
      if (!out.write(chunk)) {
        stream.pause()
        out.once('drain', () => stream.resume())
      }
      return true
    }
    out.on('error', () => finish('failed'))
    if (first.length && !take(first)) return
    stream.on('data', (chunk: Buffer) => { if (!settled) take(chunk) })
    stream.once('end', () => out.end(() => finish({ sha256: hash.digest('hex'), size })))
    stream.once('close', () => { if (!stream.readableEnded) finish('failed') })
    stream.resume()
  })
}

export function createBundleWrite(o: BundleStreamOptions): ContentHandler {
  const tell = o.tell ?? (e => hqConnectionManager.sendEvent(BUNDLE_EVENTS.landed, e))
  return async (stream, params) => {
    const answer = async (result: BundleWriteHead, claims: BundleTicketClaims | null) => {
      if (claims) tell({ transferId: claims.jti, bundleId: claims.bundleId, result, at: new Date((o.now ?? Date.now)()).toISOString() })
      await endWith(stream, encodeBundleWriteHead(result))
    }
    const ticket = readTicket(params)
    const source = await readSourceHead(stream)
    if (!ticket) return answer({ ok: false, refusal: 'ticket-invalid' }, null)
    const claims = await verify(ticket, 'to', o).catch(() => 'failed' as const)
    if (typeof claims === 'string') return answer({ ok: false, refusal: claims }, null)
    if (!takeOnce(claims.jti, claims.exp * 1000, (o.now ?? Date.now)())) return answer({ ok: false, refusal: 'ticket-used' }, null)
    if (!source) return answer({ ok: false, refusal: 'failed' }, claims)
    if (!source.head.ok) return answer({ ok: false, refusal: source.head.refusal }, claims)
    if (source.head.size !== claims.size) return answer({ ok: false, refusal: 'hash-mismatch' }, claims)
    if (claims.size > BUNDLE_MAX_BYTES) return answer({ ok: false, refusal: 'too-large' }, claims)
    const free = await fs.statfs(await freshBundleDir(claims.bundleId)).then(s => s.bavail * s.bsize, () => Infinity)
    if (claims.size > free) {
      await fs.rm(bundleDir(claims.bundleId), { recursive: true, force: true })
      return answer({ ok: false, refusal: 'too-large' }, claims)
    }
    const file = incomingFile(claims.bundleId)
    const got = await receive(stream, source.rest, file, claims.size)
    if (typeof got === 'string' || got.size !== claims.size || got.sha256 !== claims.sha256) {
      await fs.rm(bundleDir(claims.bundleId), { recursive: true, force: true })
      return answer({ ok: false, refusal: typeof got === 'string' ? got : 'hash-mismatch' }, claims)
    }
    await fs.rename(file, bundleFile(claims.bundleId))
    logger.info(`Bundle ${claims.bundleId} arrived (${got.size} bytes).`)
    return answer({ ok: true, sha256: got.sha256, size: got.size }, claims)
  }
}
