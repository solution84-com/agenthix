/**
 * The headers every answer to a browser carries, refusals included (spec part 1 step 8, part 6 T2, T7, T8): whatever
 * the file turns out to be, it gets no origin and no script, no type but the one sent, and no referrer; and only the
 * app's origin may read it, never with credentials — the ticket is the only authority.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isDemoMode, relayAnswerForm, type FileServeHead, type RelayDoor } from '@agenthix/core'

export const EXPOSED_HEADERS = 'Content-Length, Content-Range, Accept-Ranges, Content-Disposition, Content-Type'

export function setCommonHeaders(req: IncomingMessage, res: ServerResponse, appOrigin: string | null): void {
  res.setHeader('Content-Security-Policy', 'sandbox')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  // hq's pages draw files from the files address, which is another origin.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Vary', 'Origin')
  if (appOrigin && req.headers.origin === appOrigin) {
    res.setHeader('Access-Control-Allow-Origin', appOrigin)
    res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS)
  }
}

/** The answer to a CORS preflight: only for the app's origin, only `GET`/`HEAD` with `Range`. */
export function setPreflightHeaders(req: IncomingMessage, res: ServerResponse, appOrigin: string | null): boolean {
  if (!appOrigin || req.headers.origin !== appOrigin) return false
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD')
  res.setHeader('Access-Control-Allow-Headers', 'Range')
  res.setHeader('Access-Control-Max-Age', '600')
  return true
}

export function dispositionFor(kind: 'inline' | 'attachment', fileName: string): string {
  const plain = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_')
  let encoded: string
  try {
    encoded = encodeURIComponent(fileName)
  } catch {
    // A lone surrogate, from a site: the plain name alone.
    return `${kind}; filename="${plain}"`
  }
  return `${kind}; filename="${plain}"; filename*=UTF-8''${encoded}`
}

export type ServedHead = Extract<FileServeHead, { status: 200 | 206 }>

let demo: boolean | null = null

/**
 * The public demo (adr-0186) serves every file as a download, never as a page (live demo spec: the demo cannot host
 * files for others). `DEMO_MODE` is read once, at the first file served; `null` reads it again, for tests.
 */
export function downloadsOnly(reset = false): boolean {
  if (reset) demo = null
  demo ??= isDemoMode(process.env)
  return demo
}

/** The type and disposition by core's rule for the door (`relayAnswerForm`), then the length and range. */
export function setFileHeaders(res: ServerResponse, head: ServedHead, door: RelayDoor): void {
  const form = relayAnswerForm(door, head.purpose, head.contentType)
  res.setHeader('Content-Type', form.contentType)
  res.setHeader('Content-Disposition', dispositionFor(downloadsOnly() ? 'attachment' : form.disposition, head.fileName))
  res.setHeader('Accept-Ranges', 'bytes')
  if (head.status === 206 && head.range) {
    res.setHeader('Content-Range', `bytes ${head.range.start}-${head.range.end}/${head.size}`)
    res.setHeader('Content-Length', String(head.range.end - head.range.start + 1))
  } else {
    res.setHeader('Content-Length', String(head.size))
  }
}

/** The bytes a served head promises: what the relay checks the stream against. */
export function promisedLength(head: ServedHead): number {
  return head.status === 206 && head.range ? head.range.end - head.range.start + 1 : head.size
}

/** A short answer in words; once headers went out, the only answer left is to cut the response. */
export function answerPlain(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.writeHead(status)
  res.end(res.req?.method === 'HEAD' ? undefined : text)
}
