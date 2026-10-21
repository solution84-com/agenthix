import type { Server as HttpServer } from 'node:http'
import { Logger } from './utils/logger'

const logger = new Logger('startup')

type MaybeIo = {
  httpServer?: HttpServer
  engine?: { httpServer?: HttpServer }
}

/**
 * Wasp does not hand the app its underlying http server, so anything needing a
 * raw `upgrade` handler (the Execution Site control channel, the live-preview
 * HMR proxy) has to reach it through the socket.io instance that webSocketFn
 * stashes on globalThis.
 *
 * It is `io.httpServer`, not `io.engine.httpServer`. engine.io declares the
 * latter in its types but never assigns it in the version Wasp 0.21 pins, so
 * reading it returns undefined forever — the live-preview upgrade handler had
 * been silently failing to attach for exactly that reason. The engine fallback
 * stays only in case a later version starts populating it.
 */
export function getWaspHttpServer(): HttpServer | null {
  const io = (globalThis as { __wasp_io__?: MaybeIo }).__wasp_io__
  return io?.httpServer ?? io?.engine?.httpServer ?? null
}

/**
 * Runs `attach` as soon as the http server exists. `__wasp_io__` appears when
 * webSocketFn first runs, which may be after server setup.
 *
 * Bounded on purpose: if it is never going to appear, say so once instead of
 * polling silently forever. A handler that never attached used to look exactly
 * like one that had.
 */
/** Handlers still waiting for the http server: until none is, a WebSocket upgrade to their path finds nobody. */
const waiting = new Set<object>()

/**
 * Whether every handler asked for has attached, or given up. hq's `/health` says it is up only then, so whatever
 * waits on it — the install, the cross-app suite — never dials a link before hq listens for it.
 */
export function upgradeHandlersReady(): boolean {
  return waiting.size === 0
}

export function whenWaspHttpServerReady(
  label: string,
  attach: (server: HttpServer) => void,
  { attempts = 30, intervalMs = 1000 } = {},
): void {
  const token = {}
  const tryAttach = (): boolean => {
    const server = getWaspHttpServer()
    if (!server) return false
    attach(server)
    waiting.delete(token)
    return true
  }

  waiting.add(token)
  if (tryAttach()) return

  let left = attempts
  const iv = setInterval(() => {
    if (tryAttach()) {
      clearInterval(iv)
      return
    }
    if (--left <= 0) {
      clearInterval(iv)
      waiting.delete(token)
      logger.error(`${label}: Wasp's http server never became reachable — not attached.`)
    }
  }, intervalMs)
  iv.unref?.()
}
