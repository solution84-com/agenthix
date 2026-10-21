/**
 * What every request to the Fleet Console passes before a route sees it (spec §4 C1). It listens on 127.0.0.1, or in
 * its container on its own network, whose port Docker publishes to the machine's 127.0.0.1 only; these checks hold
 * even so, because a browser on the machine can be made to send requests by any page it opens:
 *
 * - the peer must be the loopback — or, in its container, its network's gateway, through which Docker hands it a
 *   connection to the published port, arriving on its own address there (`peerAllowed`);
 * - the Host header must name the loopback (`127.0.0.1` or `localhost`, any port, for an SSH tunnel), so a page
 *   whose own name was made to point at 127.0.0.1 (DNS rebinding) is refused;
 * - a request from another origin or another site is refused, and a state-changing one must be JSON;
 * - a session needs its HTTP-only cookie and its CSRF token header together (sessions.ts says why both).
 *
 * Through remote access on a machine Cloud runs (net/remoteListener.ts) the peer was checked against the allow list
 * before TLS; here the Host header must be the name its certificate is for, the origin that name over https, and a
 * session one opened through remote access — and one opened there works nowhere else.
 */
import type { NextFunction, Request, Response } from 'express'
import type { RoleCheck } from '../auth/roleCheck'
import type { Session, Sessions } from '../auth/sessions'
import { remoteNameOf } from '../net/remoteListener'

export const SESSION_COOKIE = 'console_session'
export const CSRF_HEADER = 'x-csrf-token'

/**
 * In its container: its address on its own network, and that network's gateway, both read inside the container at
 * start (net/containerNetwork.ts). Kept in the app's `locals` under `CONTAINER_PEER`; absent, only the loopback.
 */
export type ContainerPeer = { address: string; gateway: string }
export const CONTAINER_PEER = 'containerPeer'

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost)(:\d{1,5})?$/i
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// The screens load their own scripts, styles, fonts and images and call the API on this origin; nothing inline,
// nothing from anywhere else, and never inside another page's frame.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "font-src 'self'", "img-src 'self'",
  "connect-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ')

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Cache-Control', 'no-store')
  next()
}

const ipv4 = (address: string | undefined) => (address ?? '').replace(/^::ffff:/i, '')

/**
 * The loopback, or the gateway of its own network on its address there. Any other peer on that network, and
 * anything arriving on another network it is on (HQ's link network), is refused: nothing else joins its network,
 * so only Docker's forwarding of the published port comes from the gateway — and the container checks the source
 * of what it receives against its routes (`rp_filter`, set in its compose project), so a packet claiming the gateway
 * as its source is dropped unless it arrives on that network.
 */
export function peerAllowed(socket: { remoteAddress?: string; localAddress?: string }, container: ContainerPeer | undefined): boolean {
  const peer = ipv4(socket.remoteAddress)
  if (peer === '127.0.0.1') return true
  return !!container && peer === container.gateway && ipv4(socket.localAddress) === container.address
}

const hostIsName = (host: string | undefined, name: string) => {
  const h = (host ?? '').toLowerCase()
  return h === name || (h.startsWith(`${name}:`) && /^\d{1,5}$/.test(h.slice(name.length + 1)))
}

export function loopbackOnly(req: Request, res: Response, next: NextFunction): void {
  const remote = remoteNameOf(req.socket)
  if (remote !== null) {
    if (!hostIsName(req.headers.host, remote)) {
      res.status(421).json({ error: 'wrong_host', message: `Open the Fleet Console at https://${remote}.` })
      return
    }
    next()
    return
  }
  if (!peerAllowed(req.socket, req.app.locals[CONTAINER_PEER] as ContainerPeer | undefined)) {
    res.status(403).json({ error: 'not_local', message: 'The Fleet Console answers only on its own machine.' })
    return
  }
  if (!LOOPBACK_HOST.test(req.headers.host ?? '')) {
    res.status(421).json({ error: 'wrong_host', message: 'Open the Fleet Console at http://127.0.0.1:4300 on its machine, or through an SSH tunnel.' })
    return
  }
  next()
}

export function sameOriginOnly(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin
  const site = req.headers['sec-fetch-site']
  const scheme = remoteNameOf(req.socket) === null ? 'http' : 'https'
  const crossOrigin = origin !== undefined && origin !== `${scheme}://${req.headers.host}`
  const crossSite = site !== undefined && site !== 'same-origin' && site !== 'none'
  if (crossOrigin || crossSite) {
    res.status(403).json({ error: 'cross_origin', message: 'Requests from other pages are refused.' })
    return
  }
  if (!SAFE_METHODS.has(req.method) && hasBody(req) && !req.is('application/json')) {
    res.status(415).json({ error: 'not_json', message: 'Send JSON.' })
    return
  }
  next()
}

function hasBody(req: Request): boolean {
  const length = req.headers['content-length']
  return (length !== undefined && length !== '0') || req.headers['transfer-encoding'] !== undefined
}

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return undefined
}

/** `secure` through remote access, which is https; on the machine it is plain http on the loopback. */
export function sessionCookie(value: string, maxAgeSeconds: number, secure = false): string {
  return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`
}

export const clearedSessionCookie = `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`

export function requireSession(sessions: Sessions, roles: RoleCheck) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = req.headers[CSRF_HEADER]
    const found = sessions.find(readCookie(req, SESSION_COOKIE), typeof token === 'string' ? token : undefined)
    const session = found && !!found.remote === (remoteNameOf(req.socket) !== null) ? found : null
    if (!session) {
      res.status(401).json({ error: 'signed_out', message: 'Sign in with your HQ account.' })
      return
    }
    if (!(await roles.stillHolds(session))) {
      res.setHeader('Set-Cookie', clearedSessionCookie)
      res.status(401).json({ error: 'not_fleet_admin', message: 'This account no longer holds the fleet admin role.' })
      return
    }
    res.locals.session = session
    next()
  }
}

export function sessionOf(res: Response): Session {
  return res.locals.session as Session
}
