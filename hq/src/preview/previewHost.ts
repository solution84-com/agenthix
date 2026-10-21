/**
 * The preview host: everything that arrives for `p-<id>.<preview domain>`
 * (adr-0071).
 *
 * A preview is an agent's web app, and its script is not trusted. So it is
 * served from a host of its own, where nothing of hq's sign-in can be read, and
 * a request reaches it only with a cookie that host issued in exchange for a
 * one-time ticket from hq's access check (openPreviewAction.ts).
 *
 * ## Why the http server's `emit`, not an express route
 *
 * A preview host must reach nothing of hq's: not Wasp's routes, not hq's own
 * socket.io, not the site channel's upgrade handler. Those are listeners on
 * the same http server, attached at different times and in no order this
 * module controls, and a listener cannot stop the others from running. Routing
 * at `emit` is the one point every request and upgrade passes before any of
 * them, so a preview host's traffic comes here and only here, whatever is
 * attached later. Every other host is hq exactly as before.
 */
import express, { type NextFunction, type Request, type Response } from 'express'
import type { Agent, IncomingMessage, Server, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { PreviewSession } from 'wasp/entities'
import { authorizePreview, type AuthDeps } from './previewAuth'
import {
  PREVIEW_COOKIE,
  checkPreviewClaim,
  previewSetCookie,
  readCookie,
  signPreviewClaim,
  withoutCookie,
} from './previewCookie'
import type { TicketStore } from './previewTicket'
import { PREVIEW_ENTER_PATH, previewIdFromHost } from './previewWiring'
import { relayWeb, relayWs, startingPage } from './previewProxy'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Preview')

export interface PreviewHostDeps extends AuthDeps {
  /** The install's preview domain; null when previews are off. */
  domain: () => string | null
  /** hq's browser app, where the access check's page is. */
  hqClientUrl: () => string
  cookieKey: () => Buffer
  tickets: TicketStore
  /** HQ_TRUSTED_PROXIES — decides whether a request arrived over HTTPS. */
  trustProxy: number
  touch: (id: string) => Promise<void>
  markStatus: (id: string, status: 'expired') => Promise<void>
  agentFor: (session: PreviewSession) => Agent
  now?: () => number
}

export interface PreviewHost {
  request(req: IncomingMessage, res: ServerResponse): void
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void
}

/** The page hq's access check lives on, for one preview. */
export function accessCheckUrl(hqClientUrl: string, id: string): string {
  return `${hqClientUrl.replace(/\/+$/, '')}/open-preview/${id}`
}

/**
 * What is ours never reaches the agent's dev server: our preview cookie is
 * removed from the Cookie header, and the ticket never leaves the enter path,
 * which is answered here. Everything else is the previewed app's own and is
 * passed through — its own cookies, set on its own host, and any
 * Authorization header, which cannot be hq's: hq's bearer is sent only to
 * hq's own address, never to a preview host (adr-0071).
 */
function stripOurCookie(req: IncomingMessage): void {
  const kept = withoutCookie(req.headers.cookie, PREVIEW_COOKIE)
  if (kept) req.headers.cookie = kept
  else delete req.headers.cookie
}

function pathOf(url: string | undefined): string {
  const q = (url ?? '/').indexOf('?')
  return q < 0 ? (url ?? '/') : (url ?? '/').slice(0, q)
}

function refuse(res: Response, code: number, message: string): void {
  res.status(code).set('Cache-Control', 'no-store').type('html').send(
    `<!doctype html><meta charset="utf-8"><title>Preview</title>` +
      `<body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0">` +
      `<p>${message.replace(/[<&]/g, c => (c === '<' ? '&lt;' : '&amp;'))}</p></body>`,
  )
}

export function createPreviewHost(deps: PreviewHostDeps): PreviewHost {
  const now = deps.now ?? Date.now
  const idOf = (req: IncomingMessage): string | null => previewIdFromHost(req.headers.host, deps.domain())
  const gone = (id: string) => () => deps.markStatus(id, 'expired')

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', deps.trustProxy)

  // Redeems the ticket hq's access check minted, and swaps it for this host's
  // own cookie. Answered here and never relayed, so the ticket never reaches
  // the dev server.
  app.get(PREVIEW_ENTER_PATH, async (req: Request, res: Response) => {
    const id = idOf(req)
    const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : ''
    res.set('Referrer-Policy', 'no-referrer')
    const redeemed = id && ticket ? deps.tickets.redeem(ticket, id) : null
    if (!id || !redeemed) {
      refuse(res, 403, 'This preview link has been used or has run out. Open the preview from hq again.')
      return
    }
    const auth = await authorizePreview(id, { id: redeemed.userId }, deps)
    if (!auth.ok) {
      refuse(res, auth.code, auth.message)
      return
    }
    const exp = auth.session.expiresAt.getTime()
    const value = signPreviewClaim({ userId: redeemed.userId, previewId: id, exp }, deps.cookieKey())
    res.set('Set-Cookie', previewSetCookie(value, exp, req.secure, now()))
    res.set('Cache-Control', 'no-store')
    res.redirect(302, '/')
  })

  app.use(async (req: Request, res: Response) => {
    const id = idOf(req)
    if (!id) {
      refuse(res, 404, 'no such preview')
      return
    }
    const check = checkPreviewClaim(readCookie(req.headers.cookie, PREVIEW_COOKIE), id, deps.cookieKey(), now())
    if (!check.ok) {
      if (check.reason === 'invalid') {
        refuse(res, 403, 'not authorized for this preview')
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        res.set('Cache-Control', 'no-store')
        res.redirect(302, accessCheckUrl(deps.hqClientUrl(), id))
      } else {
        refuse(res, 401, 'open this preview from hq first')
      }
      return
    }
    const auth = await authorizePreview(id, { id: check.claim.userId }, deps)
    if (!auth.ok) {
      refuse(res, auth.code, auth.message)
      return
    }
    if (auth.session.status === 'starting') {
      res.status(200).set('Cache-Control', 'no-store').send(startingPage())
      return
    }
    await deps.touch(auth.session.id)
    stripOurCookie(req)
    relayWeb(req, res, deps.agentFor(auth.session), gone(id))
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('request failed', err)
    if (!res.headersSent) refuse(res, 500, 'the preview could not be served')
    else res.destroy()
  })

  const upgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> => {
    // As in siteUpgrade.ts: a reset during the awaits below would otherwise be
    // an unlistened 'error' that crashes hq, with no credential needed.
    socket.on('error', () => {})
    const id = idOf(req)
    if (!id || pathOf(req.url) === PREVIEW_ENTER_PATH) {
      socket.destroy()
      return
    }
    const check = checkPreviewClaim(readCookie(req.headers.cookie, PREVIEW_COOKIE), id, deps.cookieKey(), now())
    if (!check.ok) {
      socket.destroy()
      return
    }
    const auth = await authorizePreview(id, { id: check.claim.userId }, deps)
    if (!auth.ok || auth.session.status !== 'running') {
      socket.destroy()
      return
    }
    stripOurCookie(req)
    relayWs(req, socket, head, deps.agentFor(auth.session), gone(id))
  }

  return {
    request: (req, res) => app(req as Request, res as Response),
    upgrade: (req, socket, head) => {
      upgrade(req, socket, head).catch(err => {
        logger.warn('upgrade failed', err)
        socket.destroy()
      })
    },
  }
}

/**
 * Routes every request and upgrade whose Host is a preview host to `host`, and
 * everything else on to the server's own listeners unchanged.
 */
export function attachPreviewHost(server: Server, host: PreviewHost, domain: () => string | null): void {
  const emit = server.emit.bind(server) as (event: string | symbol, ...args: unknown[]) => boolean
  const routed = (event: string | symbol, ...args: unknown[]): boolean => {
    if (event === 'request' || event === 'upgrade') {
      const req = args[0] as IncomingMessage
      if (previewIdFromHost(req.headers.host, domain())) {
        if (event === 'request') host.request(req, args[1] as ServerResponse)
        else host.upgrade(req, args[1] as Duplex, args[2] as Buffer)
        return true
      }
    }
    return emit(event, ...args)
  }
  server.emit = routed as typeof server.emit
}
