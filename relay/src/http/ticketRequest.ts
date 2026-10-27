/**
 * A browser's request for a file: `GET` or `HEAD` of a ticket at one of the relay's two doors (`./door.ts`) — and
 * `/health` on any host, for the start test — and nothing else (adr-0153).
 *
 * A site's file: the relay checks nothing about the ticket. It reads, unverified, which site it names and for whom,
 * and hands it to that site's line with `files.serve`; the site verifies every field and answers with a head, then the
 * bytes. An upload hq keeps itself: the relay is the ticket's audience and serves it from hq's storage folder after
 * verifying it as a site would (`../uploads/serveUpload.ts`). Either way it never logs the request. The files host
 * also serves the PDF viewer page (`../viewer/viewerRoute.ts`).
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  CONTENT_OPEN_TIMEOUT_MS, FILES_SERVE_METHOD, STREAM_CREDIT_STEP_BYTES, STREAM_INITIAL_WINDOW_BYTES, readTicketRoute,
  type FilesServeParams, type RelayDoor,
} from '@agenthix/core'
import type { KeySet } from '../keySet'
import type { Load } from '../load'
import type { SiteLines } from '../lines/siteLines'
import { serveUpload } from '../uploads/serveUpload'
import type { UploadFolder } from '../uploads/uploadFolder'
import type { ViewerAssets } from '../viewer/viewerAssets'
import { answerViewer } from '../viewer/viewerRoute'
import { ticketAtDoor } from './door'
import { answerPlain, setCommonHeaders, setPreflightHeaders } from './responseHeaders'
import { serveStream } from './serveStream'

export const HEALTH_PATH = '/health'

export type BrowserDeps = {
  lines: SiteLines
  load: Load
  filesHost: string | null
  appOrigin: string | null
  /** How long a site has to answer with its head. */
  openTimeoutMs?: number
  /** Bytes a site may send on a stream before the browser has taken them (core's initial window by default). */
  window?: number
  creditStep?: number
  /** hq's storage folder, for the uploads this relay serves itself; null when it does not serve them. */
  uploads: UploadFolder | null
  keys: KeySet
  relayId(): string | null
  now?: () => number
  /** The PDF viewer's files, served on the files host; null when this relay was built without them. */
  viewer?: ViewerAssets | null
}

/** Far beyond any range a browser sends; core's parser ignores what it cannot read. */
const MAX_RANGE_LENGTH = 256

export function handleBrowserRequest(deps: BrowserDeps) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    // Nothing of a session reaches a site, whatever the browser sent.
    delete req.headers.cookie
    delete req.headers.authorization
    const path = (req.url ?? '').split('?')[0]
    // The viewer page runs script, so it carries its own policy in place of the sandbox every other answer has.
    if (answerViewer(req, res, path, { viewer: deps.viewer ?? null, filesHost: deps.filesHost, appOrigin: deps.appOrigin })) return
    setCommonHeaders(req, res, deps.appOrigin)

    if (path === HEALTH_PATH) {
      answerHealth(req, res)
      return
    }
    const at = ticketAtDoor(req.headers.host, path, { filesHost: deps.filesHost, appOrigin: deps.appOrigin })
    if (!at) {
      answerPlain(res, 404, 'Not found.')
      return
    }
    if (req.method === 'OPTIONS') {
      setPreflightHeaders(req, res, deps.appOrigin)
      res.writeHead(204)
      res.end()
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      answerPlain(res, 405, 'Only GET and HEAD are answered here. Nothing was changed.', { Allow: 'GET, HEAD' })
      return
    }
    const route = readTicketRoute(at.ticket)
    if (!route) {
      answerPlain(res, 403, 'This link is not valid. Open the file again from HQ.')
      return
    }
    const range = typeof req.headers.range === 'string' && req.headers.range.length <= MAX_RANGE_LENGTH ? req.headers.range : undefined
    const headOnly = req.method === 'HEAD'
    if (route.servedBy === 'relay') {
      serveUploadRequest(deps, res, { ticket: at.ticket, door: at.door, range, headOnly }, route.person)
      return
    }

    const mux = deps.lines.current(route.site)
    if (!mux) {
      answerPlain(res, 503, 'The site that holds this file is not connected to its relay. Try again in a moment.', { 'Retry-After': '5' })
      return
    }
    const release = takeStream(deps, res, route.person)
    if (!release) return

    const params: FilesServeParams = { ticket: at.ticket, ...(range ? { range } : {}), ...(headOnly ? { headOnly: true } : {}) }
    serveStream(mux, FILES_SERVE_METHOD, params, res, {
      door: at.door,
      headOnly,
      openTimeoutMs: deps.openTimeoutMs ?? CONTENT_OPEN_TIMEOUT_MS,
      window: deps.window ?? STREAM_INITIAL_WINDOW_BYTES,
      creditStep: deps.creditStep ?? STREAM_CREDIT_STEP_BYTES,
      carried: bytes => deps.load.carry(bytes),
      done: () => {
        release()
        deps.lines.settle(mux)
      },
    })
  }
}

function takeStream(deps: BrowserDeps, res: ServerResponse, person: string | null): (() => void) | null {
  const release = deps.load.take(person)
  if (release) return release
  answerPlain(res, 429, 'Too many files are open at once for this person. Close some and try again.', { 'Retry-After': '1' })
  return null
}

function serveUploadRequest(
  deps: BrowserDeps, res: ServerResponse,
  request: { ticket: string; door: RelayDoor; range: string | undefined; headOnly: boolean }, person: string | null,
): void {
  if (!deps.uploads) {
    answerPlain(res, 503, "This relay is not serving HQ's uploads: HQ's storage folder is not mounted into it. An administrator can mount it read-only and set HQ_UPLOADS_ROOT.")
    return
  }
  const relayId = deps.relayId()
  if (!relayId) {
    answerPlain(res, 503, 'The relay is not connected to HQ yet. Try again in a moment.', { 'Retry-After': '5' })
    return
  }
  const release = takeStream(deps, res, person)
  if (!release) return
  // A response always closes, however it ended: the stream is given back then.
  res.once('close', release)
  serveUpload(request, res, {
    folder: deps.uploads, keys: deps.keys, relayId, now: deps.now ?? Date.now, carried: bytes => deps.load.carry(bytes),
  }).catch(() => answerPlain(res, 500, 'The relay could not read this file.'))
}

function answerHealth(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    answerPlain(res, 405, 'Only GET and HEAD are answered here. Nothing was changed.', { Allow: 'GET, HEAD' })
    return
  }
  answerPlain(res, 200, 'ok')
}
