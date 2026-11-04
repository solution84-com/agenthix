/**
 * The live apps' door (live preview spec section 4, *The app*; section 6, *Apps and the relay*): every request and WebSocket whose `Host` is under
 * the preview pattern. In order: the browser's fetch metadata (appRules.ts), the entry, the cookie, the stream cap,
 * hq's word that the ticket still stands (`relay.ask`, before a new stream, its yes taken again for
 * `APP_ASK_REUSE_MS`), the site's line; then the request is
 * carried on its own `app.serve` stream, where the site checks the ticket again. Nothing here is logged: a request's
 * path, headers and cookies are the app's and the person's.
 *
 * A refusal is counted for the guard only when the request carries a cookie for this app that the relay
 * holds or held (`AppJar.knows`): a page in a browser that entered the app. A request with no cookie, or one the relay
 * never gave out, can come from anyone who knows the address, and is refused without being counted.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import {
  APP_HOP_BY_HOP_HEADERS, APP_MAX_HEADER_BYTES, APP_MAX_HEADERS, APP_MAX_TARGET_BYTES, STREAM_CREDIT_STEP_BYTES,
  STREAM_INITIAL_WINDOW_BYTES, isAppRequestHead, isRelayCookieName, previewOrigin, type AppHeader, type AppRequestHead,
  type AppServeParams, type RelayAppRefusal, type StreamMux,
} from '@agenthix/core'
import { answerRelayRefusal, answerWords, refuseSocket, refuseSocketForRelay } from './appAnswers'
import { APP_ASK_REUSE_MS, APP_HEAD_TIMEOUT_MS, type AppDoorDeps } from './appDeps'
import { enterApp } from './appEntry'
import { carryAppRequest } from './appHttp'
import { cookiesForApp, type Entered } from './appJar'
import { judgeAppRequest, requestFacts } from './appRules'
import { carryAppSocket } from './appSocket'
import { previewHostOf } from './previewHost'
import { answerPreviewCheck } from '../http/previewCheck'

const HOP = new Set<string>(APP_HOP_BY_HOP_HEADERS)

/** The browser's request as the app gets it: hop-by-hop headers and the relay's own cookies left out. */
export function appRequestHead(req: IncomingMessage, websocket: boolean): AppRequestHead | null {
  const headers: AppHeader[] = []
  let bytes = 0
  for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i].toLowerCase()
    if (HOP.has(name) || name === 'sec-websocket-protocol') continue
    const value = name === 'cookie' ? cookiesForApp(req.rawHeaders[i + 1], isRelayCookieName) : req.rawHeaders[i + 1]
    if (value === undefined) continue
    headers.push([name, value])
    bytes += name.length + value.length
  }
  const target = req.url ?? ''
  if (headers.length > APP_MAX_HEADERS || bytes > APP_MAX_HEADER_BYTES || target.length > APP_MAX_TARGET_BYTES) return null
  const protocols = String(req.headers['sec-websocket-protocol'] ?? '').split(',').map(p => p.trim()).filter(Boolean)
  const head: AppRequestHead = {
    method: req.method ?? 'GET', target, headers, ...(websocket ? { websocket: { protocols } } : {}),
  }
  return isAppRequestHead(head) ? head : null
}

type Admitted = { entry: Entered; mux: StreamMux; release: () => void; params: AppServeParams }
type Refused = { refuse: RelayAppRefusal } | { status: number; text: string }

/** Everything a new stream needs before it is opened, or why it is refused. */
async function admit(req: IncomingMessage, appId: string, deps: AppDoorDeps, websocket: boolean): Promise<Admitted | Refused> {
  const entry = deps.jar.find(String(req.headers.cookie ?? ''), appId)
  if (!entry) return { refuse: 'no-cookie' }
  const request = appRequestHead(req, websocket)
  if (!request) return { status: 431, text: 'This request is larger than an app takes. Nothing was changed.' }
  const release = deps.load.take(entry.claims.person)
  if (!release) return { status: 429, text: 'Too many requests to apps are open at once for you. Try again in a moment.' }
  const { claims } = entry
  const now = (deps.now ?? Date.now)()
  let stands = (entry.askedUntilMs ?? 0) > now
  if (!stands) {
    try {
      stands = await deps.ask({ ticketId: claims.jti, person: claims.person, appId, livePreviewId: claims.livePreviewId })
    } catch {
      stands = false
    }
    if (stands) entry.askedUntilMs = (deps.now ?? Date.now)() + APP_ASK_REUSE_MS
  }
  if (!stands) {
    release()
    deps.jar.forget(entry.handle)
    return { refuse: 'revoked' }
  }
  const mux = deps.lines.current(claims.site)
  if (!mux) {
    release()
    return { status: 503, text: "The site running this app isn't connected to its relay. Try again in a moment." }
  }
  return { entry, mux, release, params: { ticket: entry.ticket, request } }
}

/** Answers a request on a preview address; false when the request is for no preview address at all. */
export function handleAppRequest(req: IncomingMessage, res: ServerResponse, deps: AppDoorDeps): boolean {
  const at = previewHostOf(deps.pattern, req.headers.host)
  if (!at) return false
  // The Fleet Console's check name, answered before any rule: the check sends no fetch metadata.
  if ('check' in at) return answerPreviewCheck(req, res, deps.pattern)
  if ('unknown' in at) {
    answerRelayRefusal(res, 'unknown-app', deps.hqOrigin)
    return true
  }
  const appId = at.app
  const appOrigin = previewOrigin(deps.pattern!, appId)!
  const refuse = (refusal: RelayAppRefusal) => {
    if (deps.jar.knows(req.headers.cookie, appId)) deps.refusals.count(appId, refusal)
    req.resume()
    answerRelayRefusal(res, refusal, deps.hqOrigin)
  }
  const verdict = judgeAppRequest(requestFacts(req, false), appOrigin, deps.hqOrigin)
  if ('refuse' in verdict) {
    refuse(verdict.refuse)
    return true
  }
  if ('toRoot' in verdict) {
    req.resume()
    res.writeHead(303, { Location: '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
    res.end()
    return true
  }
  if (verdict.pass === 'entry') {
    void enterApp(req, res, appId, deps).catch(() => answerWords(res, 500, 'The relay could not take this entry.', deps.hqOrigin))
    return true
  }
  void admit(req, appId, deps, false).then(admitted => {
    if ('refuse' in admitted) return refuse(admitted.refuse)
    if ('status' in admitted) {
      req.resume()
      return answerWords(res, admitted.status, admitted.text, deps.hqOrigin)
    }
    const { entry, mux, release, params } = admitted
    // The browser may have left during hq's answer; its 'close' came before the listener that gives the slot back.
    if (res.destroyed) {
      req.resume()
      release()
      deps.lines.settle(mux)
      return
    }
    let untrack = () => {}
    let over = false
    const kill = carryAppRequest(mux, params, req, res, {
      hqOrigin: deps.hqOrigin,
      headTimeoutMs: deps.headTimeoutMs ?? APP_HEAD_TIMEOUT_MS,
      window: deps.window ?? STREAM_INITIAL_WINDOW_BYTES,
      creditStep: deps.creditStep ?? STREAM_CREDIT_STEP_BYTES,
      carried: bytes => deps.load.carry(bytes),
      done: () => {
        over = true
        untrack()
        release()
        deps.lines.settle(mux)
      },
    })
    if (!over) untrack = deps.jar.track(entry, kill)
  }, () => answerWords(res, 500, 'The relay could not carry this request.', deps.hqOrigin))
  return true
}

/** Takes a WebSocket handshake on a preview address; false when it is for no preview address at all. */
export function handleAppUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, deps: AppDoorDeps): boolean {
  const at = previewHostOf(deps.pattern, req.headers.host)
  if (!at) return false
  socket.on('error', () => {})
  if (!('app' in at)) {
    refuseSocketForRelay(socket, 'unknown-app')
    return true
  }
  const appId = at.app
  const refuse = (refusal: RelayAppRefusal) => {
    if (deps.jar.knows(req.headers.cookie, appId)) deps.refusals.count(appId, refusal)
    refuseSocketForRelay(socket, refusal)
  }
  const verdict = judgeAppRequest(requestFacts(req, true), previewOrigin(deps.pattern!, appId)!, deps.hqOrigin)
  if ('refuse' in verdict || 'toRoot' in verdict) {
    refuse('refuse' in verdict ? verdict.refuse : 'navigation')
    return true
  }
  // Noted from the start: the handshake's socket is half-open, so a browser that leaves ends its side without closing this one.
  let gone = false
  socket.once('end', () => { gone = true })
  socket.once('close', () => { gone = true })
  void admit(req, appId, deps, true).then(admitted => {
    if ('refuse' in admitted) return refuse(admitted.refuse)
    if ('status' in admitted) return refuseSocket(socket, admitted.status, admitted.text)
    const { entry, mux, release, params } = admitted
    if (gone) {
      socket.destroy()
      release()
      deps.lines.settle(mux)
      return
    }
    let untrack = () => {}
    let over = false
    const kill = carryAppSocket(mux, params, req, socket, head, {
      headTimeoutMs: deps.headTimeoutMs ?? APP_HEAD_TIMEOUT_MS,
      window: deps.window ?? STREAM_INITIAL_WINDOW_BYTES,
      carried: bytes => deps.load.carry(bytes),
      done: () => {
        over = true
        untrack()
        release()
        deps.lines.settle(mux)
      },
    })
    if (!over) untrack = deps.jar.track(entry, kill)
  }, () => refuseSocket(socket, 500, 'The relay could not carry this connection.'))
  return true
}
