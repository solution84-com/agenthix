/**
 * How a command run on hq's machine reaches the running hq (getting-in spec,
 * Getting back in): a Unix socket in a folder only hq's own user can open. In a
 * container that is hq-server's own /tmp, reached by `docker compose exec`;
 * whoever can do that controls hq's machine, which is the proof the commands
 * rely on. Nothing on the network can reach it.
 *
 * One request per connection: a JSON line `{ "command", "args" }`, answered by
 * one JSON line, a `CommandResult`. The host service sends it,
 * from inside hq-server (`host/src/hq/control.ts`).
 */
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import type { CommandResult } from './hqMachineCommands'

export type CommandHandler = (command: string, args: string[]) => Promise<CommandResult>

const MAX_REQUEST_BYTES = 4096
const REQUEST_TIMEOUT_MS = 10_000

/** Where the socket is: `HQ_CONTROL_SOCKET`, else a folder per port under the temp folder. */
export function controlSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.HQ_CONTROL_SOCKET) return env.HQ_CONTROL_SOCKET
  return path.join(os.tmpdir(), `agenthix-hq-${env.PORT || '3001'}`, 'control.sock')
}

/**
 * The socket's folder, made private to this user. A folder that is a link, or
 * belongs to another user, is refused rather than used: someone else could
 * then reach the socket, or put their own in its place.
 */
export function preparePrivateFolder(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const stat = fs.lstatSync(dir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`${dir} is not a folder`)
  const uid = process.getuid?.()
  if (uid !== undefined && stat.uid !== uid) throw new Error(`${dir} belongs to another user`)
  if ((stat.mode & 0o077) !== 0) fs.chmodSync(dir, 0o700)
}

function parseRequest(line: string): { command: string; args: string[] } | null {
  try {
    const value = JSON.parse(line) as { command?: unknown; args?: unknown }
    if (typeof value.command !== 'string') return null
    const args = Array.isArray(value.args) ? value.args.filter((a): a is string => typeof a === 'string') : []
    return { command: value.command, args }
  } catch {
    return null
  }
}

function serve(conn: net.Socket, handler: CommandHandler, requestTimeoutMs: number): void {
  let buffer = ''
  let answered = false
  const answer = (result: CommandResult) => {
    if (answered) return
    answered = true
    conn.end(`${JSON.stringify(result)}\n`)
  }
  conn.setEncoding('utf8')
  conn.setTimeout(requestTimeoutMs, () => conn.destroy())
  conn.on('error', () => conn.destroy())
  conn.on('data', (chunk: string) => {
    if (answered) return
    buffer += chunk
    if (buffer.length > MAX_REQUEST_BYTES) return answer({ ok: false, error: 'Request too long' })
    const end = buffer.indexOf('\n')
    if (end < 0) return
    const request = parseRequest(buffer.slice(0, end))
    if (!request) return answer({ ok: false, error: 'Not a request' })
    // The limit is for reading the request; a command may take longer (address-move waits on every site), and the
    // client keeps its own.
    conn.setTimeout(0)
    handler(request.command, request.args).then(answer, (err: unknown) =>
      answer({ ok: false, error: err instanceof Error ? err.message : String(err) }))
  })
}

export async function startControlSocket(
  handler: CommandHandler, socketPath = controlSocketPath(), requestTimeoutMs = REQUEST_TIMEOUT_MS,
): Promise<net.Server> {
  preparePrivateFolder(path.dirname(socketPath))
  // A socket left by an earlier process of hq that did not close it.
  fs.rmSync(socketPath, { force: true })
  const server = net.createServer(conn => serve(conn, handler, requestTimeoutMs))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, () => {
      server.off('error', reject)
      resolve()
    })
  })
  fs.chmodSync(socketPath, 0o600)
  return server
}
