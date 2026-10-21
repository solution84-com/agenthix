/**
 * A Unix socket that takes one JSON request per connection and answers in JSON lines: any number of progress
 * lines, then one final line, after which the connection closes. Used by both of the host service's sockets.
 */
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

export type Progress =
  | { event: 'step'; step: string }
  | { event: 'stepDone'; outcome: string }
  | { event: 'note'; text: string }
  /** A machine connecting to a Fleet Console waits for a fleet admin to compare these (spec §6). */
  | { event: 'join'; machine: string; fingerprint: string }
  /** It confirmed, and this machine pinned the Fleet Console's identity. */
  | { event: 'joined'; machine: string; consoleFingerprint: string; hqAddress: string }

/** `closed` is aborted when the asker goes away — Ctrl-C on the CLI — so a long wait can stop with it. */
export type Handler = (request: unknown, progress: (p: Progress) => void, closed?: AbortSignal) => Promise<unknown>

const MAX_REQUEST_BYTES = 64 * 1024
const REQUEST_TIMEOUT_MS = 10_000

export type SocketMode = { folderMode: number; socketMode: number }

/** The owner socket: its folder and the socket itself are root's alone, so only `docker exec` reaches it. */
export const PRIVATE: SocketMode = { folderMode: 0o700, socketMode: 0o600 }
/** The figures socket: open to the site's user in the volume mounted into the site, and read-only by what it serves. */
export const SHARED: SocketMode = { folderMode: 0o755, socketMode: 0o666 }

function serve(conn: net.Socket, handler: Handler): void {
  let buffer = ''
  let taken = false
  const closed = new AbortController()
  conn.on('close', () => closed.abort())
  const write = (value: unknown) => {
    if (!conn.destroyed) conn.write(`${JSON.stringify(value)}\n`)
  }
  conn.setEncoding('utf8')
  conn.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!taken) conn.destroy()
  })
  conn.on('error', () => conn.destroy())
  conn.on('data', (chunk: string) => {
    if (taken) return
    buffer += chunk
    if (buffer.length > MAX_REQUEST_BYTES) {
      taken = true
      conn.end(`${JSON.stringify({ event: 'result', ok: false, op: null, refusal: { code: 'malformed', message: 'The request is too long.' } })}\n`)
      return
    }
    const end = buffer.indexOf('\n')
    if (end < 0) return
    taken = true
    conn.setTimeout(0)
    let request: unknown
    try {
      request = JSON.parse(buffer.slice(0, end))
    } catch {
      request = undefined
    }
    handler(request, p => write(p), closed.signal).then(
      result => conn.end(`${JSON.stringify({ event: 'result', ...(result as object) })}\n`),
      (err: unknown) => conn.end(`${JSON.stringify({
        event: 'result', ok: false, op: null,
        refusal: { code: 'failed', message: err instanceof Error ? err.message : String(err) },
      })}\n`),
    )
  })
}

export async function listen(socketPath: string, mode: SocketMode, handler: Handler): Promise<net.Server> {
  const dir = path.dirname(socketPath)
  fs.mkdirSync(dir, { recursive: true, mode: mode.folderMode })
  const stat = fs.lstatSync(dir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${dir} is not a folder`)
  fs.chmodSync(dir, mode.folderMode)
  // A socket left by an earlier process that did not close it.
  fs.rmSync(socketPath, { force: true })
  const server = net.createServer(conn => serve(conn, handler))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, () => {
      server.off('error', reject)
      resolve()
    })
  })
  fs.chmodSync(socketPath, mode.socketMode)
  return server
}

/** One request to a line socket: progress lines go to `onProgress`, and the final line is the answer. */
export function ask(socketPath: string, request: unknown, onProgress: (p: Progress) => void = () => {}): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath)
    let buffer = ''
    let answer: Record<string, unknown> | null = null
    conn.setEncoding('utf8')
    conn.on('connect', () => conn.write(`${JSON.stringify(request)}\n`))
    conn.on('data', (chunk: string) => {
      buffer += chunk
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        let value: Record<string, unknown>
        try {
          value = JSON.parse(line) as Record<string, unknown>
        } catch {
          continue
        }
        if (value.event === 'result') answer = value
        else onProgress(value as Progress)
      }
    })
    conn.on('error', reject)
    conn.on('close', () => (answer ? resolve(answer) : reject(new Error('The host service closed the connection without an answer.'))))
  })
}
