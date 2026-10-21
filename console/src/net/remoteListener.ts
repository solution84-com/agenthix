/**
 * The Fleet Console's listener for remote access on a machine Agenthix Cloud runs (pre-release spec B9): TLS ends
 * here, with the key made on this machine (csr.ts) and the chain Cloud had issued for its name. A bare connection
 * from an address the allow list does not hold is closed at once, before TLS and before any HTTP.
 *
 * What comes through is the same app as on the machine, so every guard and every rule for a session that came
 * through remote access applies (`remoteNameOf` is how they tell): the Host header and origin must be this name, a
 * sign-in needs the authenticator code besides the HQ login, and such a session can never turn remote access on.
 */
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import type { AllowList } from './allowList'

const REMOTE = new WeakMap<object, string>()

/** The name remote access answers at, for a request's socket that came through it; null for any other. */
export function remoteNameOf(socket: object): string | null {
  return REMOTE.get(socket) ?? null
}

export type RemoteListenerOptions = {
  host: string
  port: number
  name: string
  key: string
  /** The leaf certificate first, then its chain. */
  certificate: string
  allow: AllowList
  app: http.RequestListener
}

export type RemoteListener = { close: () => Promise<void> }

export async function startRemoteListener(o: RemoteListenerOptions): Promise<RemoteListener> {
  const tls = https.createServer({ key: o.key, cert: o.certificate, minVersion: 'TLSv1.2' }, o.app)
  tls.headersTimeout = 20_000
  tls.requestTimeout = 60_000
  tls.on('secureConnection', socket => REMOTE.set(socket, o.name))
  tls.on('tlsClientError', (_err, socket) => socket.destroy())

  const open = new Set<net.Socket>()
  const gate = net.createServer(socket => {
    if (!o.allow.allows(socket.remoteAddress)) {
      socket.destroy()
      return
    }
    open.add(socket)
    socket.on('close', () => open.delete(socket))
    socket.setTimeout(120_000, () => socket.destroy())
    // Synchronously, in the same turn the connection arrived: nothing has been read from it yet.
    tls.emit('connection', socket)
  })
  await new Promise<void>((resolve, reject) => {
    gate.once('error', reject)
    gate.listen(o.port, o.host, () => {
      gate.off('error', reject)
      resolve()
    })
  })
  return {
    close: () => new Promise<void>(resolve => {
      gate.close(() => resolve())
      for (const s of open) s.destroy()
      tls.close()
    }),
  }
}
