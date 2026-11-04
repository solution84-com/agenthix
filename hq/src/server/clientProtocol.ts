/**
 * The client protocol on hq's side (core's `client` entry): every HTTP request Wasp's router serves — its
 * operations, its auth routes and hq's APIs — and every socket.io handshake reads the version the app states, and
 * refuses it under the rule every connection follows. Two or more majors apart, or a version hq cannot read, is a 426
 * with `ClientProtocolRefusal` over HTTP, and `ClientSocketRefusal` on the socket. **No version is served**: a
 * browser, hq's own pages, an app from before the client protocol. Sites, host services and Cloud never state one,
 * so their routes stay on their own protocols.
 *
 * **One route is never refused:** `GET /api/org/public-identity`, where an app reads hq's release and the organisation's
 * name before sign-in. It is public, needs no session and holds only what hq's sign-in page shows, and a refused app
 * needs it most: to say which organisation's HQ is on which release.
 *
 * `User-Agent` (`mobile/1.2.0`) is only logged, beside the version, and decides nothing: anyone can write it.
 */
import type { RequestHandler, Response } from 'express'
import {
  CLIENT_PROTOCOL_HANDSHAKE_FIELD, CLIENT_PROTOCOL_REFUSED, CLIENT_PROTOCOL_VERSION, CLIENT_PROTOCOL_VERSION_HEADER,
  decideClientProtocol, type ClientProtocolRefusal, type ClientSocketRefusal,
} from '@agenthix/core'
import { Logger } from './utils/logger'

const logger = new Logger('client')

/** What a served client stated, kept on `res.locals` and `socket.data` for the log lines. */
export type ClientStated = { version: string; userAgent: string | null }

const HEADER = CLIENT_PROTOCOL_VERSION_HEADER.toLowerCase()
const MAX_USER_AGENT = 120
const MAX_TOLD = 1000
const told = new Set<string>()

function userAgentOf(raw: unknown): string | null {
  const ua = typeof raw === 'string' ? raw.trim().slice(0, MAX_USER_AGENT) : ''
  return ua || null
}

function oneHeader(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}

// Each refusal is logged once per version and caller, so an app retrying does not fill the log.
function logRefusal(refusal: ClientProtocolRefusal, userAgent: string | null): void {
  const key = `${refusal.clientVersion} ${userAgent}`
  if (told.has(key)) return
  if (told.size >= MAX_TOLD) told.clear()
  told.add(key)
  logger.warn(`refused ${userAgent ?? 'a client'}: ${refusal.error}`)
}

/** The words a log line adds for a client that stated a version: `client 1.0 mobile/1.2.0`. */
export function describeClient(stated: ClientStated | undefined): string {
  return stated ? `client ${stated.version}${stated.userAgent ? ` ${stated.userAgent}` : ''}` : ''
}

export function clientStatedOf(res: Response): ClientStated | undefined {
  return res.locals.client as ClientStated | undefined
}

const ALWAYS_SERVED = { method: 'GET', path: '/api/org/public-identity' } as const

export const clientProtocolGuard: RequestHandler = (req, res, next) => {
  if (req.method === ALWAYS_SERVED.method && req.path === ALWAYS_SERVED.path) return next()
  const decision = decideClientProtocol(oneHeader(req.headers[HEADER]))
  const userAgent = userAgentOf(req.headers['user-agent'])
  if (decision.ok) {
    if (decision.clientVersion) res.locals.client = { version: decision.clientVersion, userAgent } satisfies ClientStated
    return next()
  }
  logRefusal(decision.refusal, userAgent)
  res.status(426).set(CLIENT_PROTOCOL_VERSION_HEADER, CLIENT_PROTOCOL_VERSION).json(decision.refusal)
}

/** What a handshake value that is not text is read as: no version, so the refusal says it is unreadable. */
const NOT_TEXT = '(not text)'

/** The part of a socket.io socket the handshake guard reads and writes. */
export type HandshakeSocket = {
  handshake: { auth?: Record<string, unknown>; headers: Record<string, string | string[] | undefined> }
  data?: Record<string, unknown>
}

/**
 * `io.use` middleware. The version comes from `auth.clientProtocolVersion`; an app that can only set headers on the
 * handshake may send the HTTP header instead. A value that is not a string is read as unreadable.
 */
export function clientProtocolSocketGuard(socket: HandshakeSocket, next: (err?: Error) => void): void {
  const field = socket.handshake.auth?.[CLIENT_PROTOCOL_HANDSHAKE_FIELD]
  const presented = field == null ? oneHeader(socket.handshake.headers[HEADER]) : typeof field === 'string' ? field : NOT_TEXT
  const decision = decideClientProtocol(presented)
  const userAgent = userAgentOf(socket.handshake.headers['user-agent'])
  if (decision.ok) {
    if (decision.clientVersion) socket.data = { ...socket.data, client: { version: decision.clientVersion, userAgent } satisfies ClientStated }
    return next()
  }
  logRefusal(decision.refusal, userAgent)
  const err = Object.assign(new Error(CLIENT_PROTOCOL_REFUSED), { data: decision.refusal }) as ClientSocketRefusal
  next(err)
}
