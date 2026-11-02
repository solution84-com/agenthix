/**
 * How the site reaches an app in a live preview (live preview spec section 4, *The app*): from inside the live
 * preview's own network namespace, so an app that listens only on `localhost` works as it would on a developer's own
 * machine, and no port is ever published. Each stream is one short program of the site's own, run in the container
 * by `docker exec` outside the launcher: it opens a socket to the app's port on loopback (or, for an app bound only to
 * the container's own address, there) and copies bytes between it and its standard input and output.
 *
 * The program says its process id on standard error before it connects, so the guard spares it while it carries a
 * stream. The port arrives as an argument, never pasted into the source.
 */
import { Duplex } from 'node:stream'
import { spawnHelper, type PreviewSpawned } from '../container/exec'

export const APP_RELAY_SCRIPT = `
const net = require('net'), os = require('os')
const port = Number(process.argv[1])
if (!Number.isInteger(port) || port < 1 || port > 65535) process.exit(2)
process.stderr.write('pid ' + process.pid + '\\n')
const own = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address)
const hosts = ['127.0.0.1', ...own]
function attempt(i) {
  if (i >= hosts.length) process.exit(1)
  const sock = net.connect(port, hosts[i])
  sock.once('error', () => attempt(i + 1))
  sock.once('connect', () => {
    sock.removeAllListeners('error')
    sock.on('error', () => process.exit(1))
    sock.on('close', () => process.exit(0))
    process.stdin.pipe(sock)
    sock.pipe(process.stdout)
    process.stdin.on('end', () => sock.end())
  })
}
attempt(0)
`.trim()

export const appRelayArgv = (port: number): string[] => ['node', '-e', APP_RELAY_SCRIPT, String(port)]

/** The relay's process id, from its first line on standard error; null when it never says it. */
export function readRelayPid(stderr: NodeJS.ReadableStream | null): Promise<number | null> {
  return new Promise(resolve => {
    if (!stderr) return resolve(null)
    let text = ''
    const done = (pid: number | null) => {
      stderr.removeListener('data', onData)
      resolve(pid)
    }
    const onData = (d: Buffer | string) => {
      text += d.toString()
      const m = /^pid (\d+)\n/.exec(text)
      if (m) done(Number(m[1]))
      else if (text.length > 64 || text.includes('\n')) done(null)
    }
    stderr.on('data', onData)
    stderr.once('end', () => done(null))
  })
}

/** `exited`, for a stream carried by an exec of its own: when that exec has ended. */
export type AppConnection = { socket: Duplex; pid: Promise<number | null>; exited?: Promise<number> }
export type Spawner = (id: string, argv: string[]) => Promise<PreviewSpawned>

/** A duplex to the app's port inside the live preview's container; it ends when either side does. */
export async function connectToApp(id: string, port: number, spawn: Spawner = spawnHelper): Promise<AppConnection> {
  const proc = await spawn(id, appRelayArgv(port))
  const out = proc.stdout
  const stdin = proc.stdin
  let sawBytes = false
  const socket = new Duplex({
    read() { out?.resume() },
    write(chunk, _enc, cb) {
      if (!stdin) return cb(new Error('The app relay has no input'))
      stdin.write(chunk, err => cb(err ?? null))
    },
    final(cb) {
      stdin?.end()
      cb()
    },
    destroy(err, cb) {
      proc.detach()
      cb(err)
    },
  })
  out?.on('data', (d: Buffer) => {
    sawBytes = true
    if (!socket.push(d)) out.pause()
  })
  void proc.exited.then(code => {
    if (socket.destroyed) return
    if (code !== 0 && !sawBytes) socket.destroy(new Error(`The app did not answer (the relay ended with ${code}).`))
    else socket.push(null)
  })
  return { socket, pid: readRelayPid(proc.stderr), exited: proc.exited }
}
