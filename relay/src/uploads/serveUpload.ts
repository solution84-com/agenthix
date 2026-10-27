/**
 * An upload hq keeps itself (task attachments, pictures), answered by hq's relay from hq's storage folder. Here the
 * relay is the ticket's audience, so it checks the ticket as a site checks one — with core's verifier against hq's
 * key set, for this relay's id, in the `upload` space only — before it opens anything. It still decides nothing: hq
 * decided who may read the file when it signed.
 *
 *  1. The ticket verified: signature first, then type, purpose, expiry, audience and relay this relay, space `upload`,
 *     a path core's upload patterns accept.
 *  2. The file opened without following a link (`openUpload`).
 *  3. The version from the open descriptor's own stat, so the file checked is the file read.
 *  4. The answer by the door's rule, then the whole file or one range, at the pace the browser reads.
 */
import type { ServerResponse } from 'node:http'
import type { FileHandle } from 'node:fs/promises'
import path from 'node:path'
import {
  FILE_TICKET_TOKEN_TYPE, TICKET_PURPOSES, contentTypeForName, fileVersion, parseByteRange,
  verifyRelayToken, type FileServeHead, type JsonWebKeySet, type RelayDoor,
} from '@agenthix/core'
import type { KeySet } from '../keySet'
import { BARE_REFUSAL, bareRefuses } from '../http/door'
import { answerPlain, setFileHeaders, type ServedHead } from '../http/responseHeaders'
import { answerRefusal } from '../http/serveStream'
import { openUpload, type UploadFolder } from './uploadFolder'

export type UploadRequest = {
  ticket: string
  door: RelayDoor
  range: string | undefined
  headOnly: boolean
}

export type UploadDeps = {
  folder: UploadFolder
  keys: KeySet
  relayId: string
  now: () => number
  carried(bytes: number): void
}

async function verify(ticket: string, deps: UploadDeps) {
  const check = (keys: JsonWebKeySet) => verifyRelayToken(ticket, {
    type: FILE_TICKET_TOKEN_TYPE, keys, audience: deps.relayId, relay: deps.relayId, nowMs: deps.now(),
    purposes: TICKET_PURPOSES, spaces: ['upload'],
  })
  let verdict = await check(await deps.keys.current())
  // hq may have rotated its key since the set was fetched: fetch once more (at most every 30 s), then decide.
  if (!verdict.ok && verdict.refusal === 'unknown-key') {
    const fresh = await deps.keys.refetch()
    if (fresh) verdict = await check(fresh)
  }
  return verdict
}

/** Answers the request; resolves once the response is over, however it ended. */
export async function serveUpload(req: UploadRequest, res: ServerResponse, deps: UploadDeps): Promise<void> {
  const verdict = await verify(req.ticket, deps).catch(() => null)
  if (!verdict) {
    answerPlain(res, 503, 'The relay could not reach HQ to check this link. Try again in a moment.', { 'Retry-After': '5' })
    return
  }
  if (!verdict.ok) return answerRefusal(res, verdict.refusal === 'expired' ? 'ticket-expired' : 'ticket-invalid')
  const claims = verdict.claims
  if (claims.space !== 'upload') return answerRefusal(res, 'ticket-invalid')

  const fileName = path.posix.basename(claims.path)
  if (bareRefuses(req.door, claims.purpose, fileName)) return answerPlain(res, 403, BARE_REFUSAL)
  if (res.destroyed) return

  const opened = await openUpload(deps.folder, claims.path)
  if (!opened) return answerRefusal(res, 'not-found')
  const { handle, stat } = opened
  let handedOver = false
  try {
    if (fileVersion(stat.size, stat.mtimeMs) !== claims.version) return answerRefusal(res, 'changed')
    const range = parseByteRange(req.range, stat.size)
    if (range === 'unsatisfiable') return answerRefusal(res, 'range-not-satisfiable', stat.size)
    const head: FileServeHead = {
      status: range ? 206 : 200, size: stat.size, ...(range ? { range } : {}),
      contentType: contentTypeForName(fileName), purpose: claims.purpose, fileName,
    }
    setFileHeaders(res, head as ServedHead, req.door)
    res.writeHead(head.status)
    const span = range ?? (stat.size > 0 ? { start: 0, end: stat.size - 1 } : null)
    if (req.headOnly || !span || res.destroyed) {
      res.end()
      return
    }
    handedOver = true
    await pump(res, handle, span, deps.carried)
  } finally {
    if (!handedOver) await handle.close().catch(() => {})
  }
}

/**
 * Exactly the span's bytes, piped so the browser's pace holds the read. A file that shrank since the stat sends fewer
 * bytes than the headers promised, so a short read cuts the response rather than ending it as if whole.
 */
function pump(res: ServerResponse, handle: FileHandle, span: { start: number; end: number }, carried: (n: number) => void): Promise<void> {
  const expected = span.end - span.start + 1
  // Closes the descriptor when it ends or is destroyed.
  const source = handle.createReadStream({ start: span.start, end: span.end })
  let sent = 0
  return new Promise<void>(resolve => {
    const cut = () => {
      source.destroy()
      res.destroy()
      resolve()
    }
    source.on('data', (chunk: Buffer | string) => {
      sent += chunk.length
      carried(chunk.length)
    })
    source.on('error', cut)
    res.on('close', () => {
      source.destroy()
      resolve()
    })
    source.on('end', () => {
      if (sent !== expected) return cut()
      res.end(() => resolve())
    })
    source.pipe(res, { end: false })
  })
}
