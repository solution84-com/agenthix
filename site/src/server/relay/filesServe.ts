/**
 * `files.serve` — the ticket-checked reader (adr-0153): the one way a file on this site reaches a browser. A relay
 * opens it on the line this site holds to it, with the browser's ticket; the site trusts nothing the relay says.
 *
 *  1. The ticket is verified with core's `verifyRelayToken` against hq's key set — signature first, then the type,
 *     the purpose, the expiry, `aud` this site, and `relay` the relay this line goes to — before any file is opened.
 *  2. The file is opened once through `openSiteFile`, whichever space the ticket names (a place's file, an artefact,
 *     a knowledge page): the confinement of that space's reads, the descriptor confirmed to be the entry the check
 *     approved, and a file with more than one hard link refused. A ticket for an upload is never served here.
 *     Everything after the open is one reader for every space.
 *  3. The version is computed from the open descriptor's own stat, so the file checked is the file read.
 *  4. The answer is a head (`encodeStreamHead`) and then the whole file or one byte range.
 *
 * A refusal is a head with a code. Neither a head nor a log line written here carries a ticket or a path on this disk.
 *
 * Like every content handler, this ends its own writable half and never reads its request.
 */
import {
  FILE_TICKET_TOKEN_TYPE,
  FILES_SERVE_METHOD,
  MAX_CHUNK_BYTES,
  contentTypeForName,
  encodeStreamHead,
  fileVersion,
  parseByteRange,
  refusalHead,
  verifyRelayToken,
  type ByteRange,
  type FileServeHead,
  type FileServeRefusal,
  type FilesServeParams,
  type SiteFileTicketClaims,
} from '@agenthix/core'
import type { ContentHandler } from '../hq/content/contentMethods'
import type { ContentStream } from '../hq/content/contentStream'
import type { FileHandle } from '../../agents/runtime/containedFile'
import { openSiteFile } from '../files/openSiteFile'
import { Logger } from '../utils/logger'
import type { KeySetSource } from './hqKeySet'
import { ReadsFull, type ReadSlots } from './readSlots'

const logger = new Logger('FilesServe')

export type FilesServeOptions = {
  siteId: string
  /** The relay this line goes to: a ticket for any other is refused. */
  relayId: string
  keys: KeySetSource
  slots: ReadSlots
  now?: () => number
}

function readParams(params: unknown): FilesServeParams | null {
  if (typeof params !== 'object' || params === null) return null
  const p = params as Record<string, unknown>
  if (typeof p.ticket !== 'string') return null
  if (p.range !== undefined && typeof p.range !== 'string') return null
  if (p.headOnly !== undefined && typeof p.headOnly !== 'boolean') return null
  return { ticket: p.ticket, range: p.range as string | undefined, headOnly: p.headOnly as boolean | undefined }
}

/** Writes the last bytes and ends the half; settles however the stream ends, a cancel included. */
function finish(stream: ContentStream, head: FileServeHead): Promise<void> {
  return new Promise(resolve => {
    if (stream.destroyed || stream.writableEnded) return resolve()
    stream.once('close', () => resolve())
    stream.end(Buffer.from(encodeStreamHead(head)), () => resolve())
  })
}

async function verifyTicket(
  ticket: string,
  opts: FilesServeOptions,
): Promise<{ ok: true; claims: SiteFileTicketClaims } | { ok: false; refusal: FileServeRefusal; why: string }> {
  const expect = async () => verifyRelayToken(ticket, {
    type: FILE_TICKET_TOKEN_TYPE,
    keys: await opts.keys.get(),
    audience: opts.siteId,
    nowMs: (opts.now ?? Date.now)(),
    relay: opts.relayId,
  })
  let verdict = await expect()
  // hq may have rotated its key since the set was fetched: fetch once more, then decide.
  if (!verdict.ok && verdict.refusal === 'unknown-key' && (await opts.keys.refresh())) verdict = await expect()
  // The verifier's default spaces are the site's; an upload is refused here again, so no change there can open one.
  if (verdict.ok) {
    const claims = verdict.claims
    if (claims.space === 'upload') return { ok: false, refusal: 'ticket-invalid', why: 'wrong-space' }
    return { ok: true, claims }
  }
  return { ok: false, refusal: verdict.refusal === 'expired' ? 'ticket-expired' : 'ticket-invalid', why: verdict.refusal }
}

export function createFilesServe(opts: FilesServeOptions): ContentHandler {
  return async (stream, params) => {
    const p = readParams(params)
    if (!p) return finish(stream, refusalHead('ticket-invalid'))

    let verdict
    try {
      verdict = await verifyTicket(p.ticket, opts)
    } catch (err) {
      logger.error(`${FILES_SERVE_METHOD} could not verify a ticket: ${err instanceof Error ? err.message : 'unknown'}`)
      return finish(stream, refusalHead('failed'))
    }
    if (!verdict.ok) {
      logger.warn(`${FILES_SERVE_METHOD} refused a ticket: ${verdict.why}`)
      return finish(stream, refusalHead(verdict.refusal))
    }

    let release: () => void
    let dropWaiter: (() => void) | null = null
    const onClose = () => dropWaiter?.()
    stream.once('close', onClose)
    try {
      release = await opts.slots.acquire({ onCancel: drop => { dropWaiter = drop } })
    } catch (err) {
      if (err instanceof ReadsFull) return finish(stream, refusalHead('busy'))
      return
    } finally {
      stream.off('close', onClose)
    }
    try {
      await serveFile(stream, verdict.claims, p)
    } finally {
      release()
    }
  }
}

async function serveFile(stream: ContentStream, claims: SiteFileTicketClaims, p: FilesServeParams): Promise<void> {
  if (stream.destroyed || stream.writableEnded) return
  let opened
  try {
    opened = await openSiteFile(claims, FILES_SERVE_METHOD)
  } catch (err) {
    logger.warn(`${FILES_SERVE_METHOD} could not open a file: ${(err as { code?: string } | null)?.code ?? 'failed'}`)
    return finish(stream, refusalHead('failed'))
  }
  // A directory and a missing file read the same from outside.
  if (!opened.ok) return finish(stream, refusalHead('not-found'))
  const { handle, stat, name } = opened

  // The descriptor is ours until the read stream takes it over; every other exit closes it here.
  let handedOver = false
  try {
    if (fileVersion(stat.size, stat.mtimeMs) !== claims.version) return await finish(stream, refusalHead('changed'))

    const range = parseByteRange(p.range, stat.size)
    if (range === 'unsatisfiable') return await finish(stream, refusalHead('range-not-satisfiable', stat.size))
    const head: FileServeHead = {
      status: range ? 206 : 200,
      size: stat.size,
      ...(range ? { range } : {}),
      contentType: contentTypeForName(name),
      purpose: claims.purpose,
      fileName: name,
    }
    const span = range ?? (stat.size > 0 ? { start: 0, end: stat.size - 1 } : null)
    if (p.headOnly || !span) return await finish(stream, head)
    if (stream.destroyed || stream.writableEnded) return

    handedOver = true
    await pump(stream, handle, encodeStreamHead(head), span)
  } catch (err) {
    logger.error(`${FILES_SERVE_METHOD} failed reading a file: ${(err as NodeJS.ErrnoException | null)?.code ?? 'unknown'}`)
    if (!handedOver) await finish(stream, refusalHead('failed'))
    else stream.destroy()
  } finally {
    if (!handedOver) await handle.close().catch(() => {})
  }
}

/**
 * The head, then exactly the span's bytes from the descriptor. A file that shrank since the stat would send fewer bytes
 * than the head promised, so a short read fails the stream rather than ending it as if whole.
 */
function pump(stream: ContentStream, handle: FileHandle, head: Uint8Array, span: ByteRange): Promise<void> {
  const expected = span.end - span.start + 1
  // Closes the descriptor when it ends or is destroyed.
  const source = handle.createReadStream({ start: span.start, end: span.end, highWaterMark: MAX_CHUNK_BYTES })
  let sent = 0
  return new Promise<void>(resolve => {
    let settled = false
    let ending = false
    const done = (failed: boolean) => {
      if (settled) return
      settled = true
      source.off('error', onFailure)
      stream.off('error', onFailure)
      stream.off('close', onClose)
      if (failed) {
        source.unpipe(stream)
        source.destroy()
        stream.destroy()
      }
      resolve()
    }
    const onFailure = () => done(true)
    // A close during our own end is the natural end of the read: the relay's answer to `end` can arrive first.
    const onClose = () => done(!ending)

    source.on('error', onFailure)
    stream.on('error', onFailure)
    stream.on('close', onClose)
    source.on('data', (chunk: Buffer | string) => { sent += chunk.length })
    stream.write(Buffer.from(head))
    source.pipe(stream, { end: false })
    source.on('end', () => {
      if (sent !== expected) return done(true)
      ending = true
      stream.end(() => done(false))
    })
    if (stream.destroyed) done(true)
  })
}
