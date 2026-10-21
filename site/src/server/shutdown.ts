import type http from 'node:http'

export type ShutdownDeps = {
  server: http.Server
  stopHqLink: () => void
  disconnectDb: () => Promise<void>
  exit: (code: number) => void
  log: (line: string) => void
  /** How long requests in flight may run on before their connections are cut. A relayed answer can stream for minutes. */
  graceMs?: number
}

const DEFAULT_GRACE_MS = 5_000

/**
 * Stops the site in order: no new connections, the hq link closed so hq sees
 * the site leave rather than time out, requests in flight given `graceMs` to
 * finish, the database disconnected, then exit. A second call while one is
 * running exits at once, so a second Ctrl-C is never ignored.
 */
export function createShutdown(deps: ShutdownDeps): (signal: string) => Promise<void> {
  const graceMs = deps.graceMs ?? DEFAULT_GRACE_MS
  let running = false
  return async signal => {
    if (running) {
      deps.log(`${signal} again — exiting now`)
      deps.exit(1)
      return
    }
    running = true
    deps.log(`${signal} — shutting down`)
    const closed = new Promise<void>(resolve => deps.server.close(() => resolve()))
    // close() only drops the connections idle at that moment; a keep-alive
    // connection whose request finishes later would otherwise hold the server
    // open for the whole grace period.
    const sweepIdle = setInterval(() => deps.server.closeIdleConnections(), 100)
    deps.server.closeIdleConnections()
    try {
      deps.stopHqLink()
    } catch (err) {
      deps.log(`Could not close the hq link: ${err instanceof Error ? err.message : String(err)}`)
    }
    let timer: NodeJS.Timeout | undefined
    const graceOver = new Promise<'grace'>(resolve => { timer = setTimeout(() => resolve('grace'), graceMs) })
    if ((await Promise.race([closed.then(() => 'closed' as const), graceOver])) === 'grace') {
      deps.log(`Requests still open after ${graceMs} ms — closing their connections`)
      deps.server.closeAllConnections()
      await closed
    }
    clearTimeout(timer)
    clearInterval(sweepIdle)
    try {
      await deps.disconnectDb()
    } catch (err) {
      deps.log(`Could not disconnect the database: ${err instanceof Error ? err.message : String(err)}`)
    }
    deps.exit(0)
  }
}

/**
 * SIGTERM is what `docker stop` sends. Handled here rather than left to node's
 * default, because in a container node can be PID 1, where the kernel applies
 * no default action and an unhandled SIGTERM is ignored until Docker kills the
 * process.
 *
 * gitProcessGroup.ts PREPENDS its own handler for these signals: it kills live
 * git process groups first and, seeing this listener, does not raise the
 * signal again. It removes itself after one delivery, and its `exit` hook
 * covers the second-signal path.
 */
export function installShutdownSignals(shutdown: (signal: string) => Promise<void>): () => void {
  const handlers = (['SIGTERM', 'SIGINT'] as const).map(signal => {
    const handler = () => { void shutdown(signal) }
    process.on(signal, handler)
    return [signal, handler] as const
  })
  return () => { for (const [signal, handler] of handlers) process.removeListener(signal, handler) }
}
