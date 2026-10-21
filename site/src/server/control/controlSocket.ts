import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { getSiteRoot } from '../../agents/agentDiskPaths'
import { readStatus, type SiteStatusReport } from './commands'
import { unregister, type LeaveOutcome } from './leave'
import { Logger } from '../utils/logger'

const logger = new Logger('control')

/**
 * How the `agenthix-site` command reaches the running site (ADR-0065). A Unix
 * socket in a directory only the site's user can enter — never a network port,
 * so nothing a browser or another machine can reach can command this site.
 */

export type ControlReply =
  | { type: 'status'; status: SiteStatusReport }
  | { type: 'unregistered'; toldHq: boolean; hq: LeaveOutcome }
  | { type: 'error'; message: string }

// A request line this large is never a legitimate command — every field the
// wire format carries is short — so it is refused outright rather than
// buffered without bound.
const MAX_REQUEST_BYTES = 64 * 1024

// Bounds only the wait for the FIRST complete line; the timer is cleared the
// moment a request is handled — it never bounds the reply side.
const FIRST_LINE_TIMEOUT_MS = 10_000

// macOS allows 104 bytes including the terminator; Linux 108. 103 leaves room
// for the terminator on the tighter of the two.
export const MAX_SOCKET_PATH_BYTES = 103

export function controlSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.SITE_CONTROL_SOCKET?.trim() || path.join(getSiteRoot(), 'run', 'control.sock')
}

export async function handleControlRequest(
  request: unknown,
  reply: (r: ControlReply) => void,
  signal?: AbortSignal,
): Promise<void> {
  const req = (request ?? {}) as { command?: unknown }
  try {
    switch (req.command) {
      case 'status':
        reply({ type: 'status', status: await readStatus() })
        return
      case 'unregister':
        reply({ type: 'unregistered', ...(await unregister()) })
        return
      default:
        reply({ type: 'error', message: `Unknown command: ${String(req.command)}` })
    }
  } catch (err) {
    reply({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

/** True when a live process accepts connections on the socket; a refused or missing one is stale. */
function socketAnswers(socketPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const probe = net.connect(socketPath)
    probe.once('connect', () => { probe.destroy(); resolve(true) })
    probe.once('error', (err: NodeJS.ErrnoException) => {
      probe.destroy()
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOENT' || err.code === 'ENOTSOCK') resolve(false)
      else reject(err)
    })
  })
}

export async function startControlSocket(socketPath: string = controlSocketPath()): Promise<net.Server> {
  if (Buffer.byteLength(socketPath) > MAX_SOCKET_PATH_BYTES) {
    throw new Error(
      `The control socket path is ${Buffer.byteLength(socketPath)} bytes, over the ${MAX_SOCKET_PATH_BYTES} a Unix socket allows: ${socketPath}. ` +
      'Set SITE_CONTROL_SOCKET to a shorter path, or use a shorter SITE_ROOT.',
    )
  }
  const dir = path.dirname(socketPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.chmodSync(dir, 0o700)
  if (await socketAnswers(socketPath)) {
    throw new Error(
      `Another site is already running on this SITE_ROOT: something answers on the control socket ${socketPath}. ` +
      'Stop it first, or give this one its own SITE_ROOT (or SITE_CONTROL_SOCKET).',
    )
  }
  // Nothing answers: the file, if there is one, is what a crashed site left behind.
  fs.rmSync(socketPath, { force: true })

  const server = net.createServer(conn => {
    let buf = ''
    let handled = false
    // The command going away (Ctrl-C, a dropped connection) ends whatever it started.
    const gone = new AbortController()
    conn.on('close', () => gone.abort())
    const write = (r: ControlReply) => { if (!conn.destroyed) conn.write(JSON.stringify(r) + '\n') }

    conn.setTimeout(FIRST_LINE_TIMEOUT_MS, () => {
      if (handled) return
      handled = true
      write({ type: 'error', message: 'Timed out waiting for a request' })
      conn.end()
    })

    conn.on('data', chunk => {
      if (handled) return
      buf += chunk.toString()
      if (Buffer.byteLength(buf, 'utf8') > MAX_REQUEST_BYTES) {
        handled = true
        conn.setTimeout(0)
        write({ type: 'error', message: 'Request too large' })
        conn.end()
        return
      }
      const nl = buf.indexOf('\n')
      if (nl < 0) return
      handled = true
      conn.setTimeout(0)
      let request: unknown
      try {
        request = JSON.parse(buf.slice(0, nl))
      } catch {
        write({ type: 'error', message: 'Malformed request' })
        conn.end()
        return
      }
      handleControlRequest(request, write, gone.signal).finally(() => conn.end())
    })
    conn.on('error', () => {})
  })
  server.on('listening', () => fs.chmodSync(socketPath, 0o600))
  server.on('error', err => logger.error('socket failed', err))
  server.listen(socketPath)
  return server
}
