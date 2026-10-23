/**
 * What the host service asks of the machine itself: whether a port is taken (the port check, `install/portCheck.ts`),
 * and what certificate a host name is served with on this machine's port 443 (the front door). The host service runs
 * on the machine's own network, so both are the machine's. Tests stand in fakes.
 */
import { X509Certificate } from 'node:crypto'
import net from 'node:net'
import tls from 'node:tls'

export type CertificateCheck = { ok: true; expiresAt: string } | { ok: false; problem: string }

/** True when something holds `port` on `host`, the address it would be published on; null when that cannot be told. */
export type PortInUse = (port: number, host: string) => Promise<boolean | null>

export type FrontDoorProbes = {
  /**
   * The certificate this machine's port 443 serves for `host`: checked as a browser checks it, or, when the front door
   * was given one (`expected`, PEM), checked to be exactly that one. A given certificate may be trusted only by the
   * proxy in front, as a Cloudflare Origin CA certificate is, so a browser's check would never pass it.
   */
  certificate: (host: string, expected?: string) => Promise<CertificateCheck>
}

/** A bind probe: listening on the address the port would be published on fails while anything holds it. */
export const machinePortInUse: PortInUse = (port, host) => {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', (err: NodeJS.ErrnoException) => resolve(err.code === 'EADDRINUSE' ? true : null))
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(false)))
  })
}

/** The probe on `port`: the machine's 443, or a test's listener. */
export function certificateProbe(port = 443): FrontDoorProbes['certificate'] {
  return (host, expected) => new Promise(resolve => {
    let want: Buffer | null = null
    if (expected !== undefined) {
      try {
        want = new X509Certificate(expected).raw
      } catch {
        resolve({ ok: false, problem: 'the certificate given cannot be read' })
        return
      }
    }
    const socket = tls.connect({ host: '127.0.0.1', port, servername: host, rejectUnauthorized: want === null, timeout: 10_000 })
    const done = (check: CertificateCheck) => {
      socket.destroy()
      resolve(check)
    }
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate()
      if (want && !(cert?.raw && want.equals(cert.raw))) return done({ ok: false, problem: 'it is served with another certificate than the one given' })
      const expires = cert?.valid_to ? new Date(cert.valid_to) : null
      done(expires && !Number.isNaN(expires.getTime())
        ? { ok: true, expiresAt: expires.toISOString() }
        : { ok: false, problem: 'it is served with no certificate a browser accepts' })
    })
    socket.once('timeout', () => done({ ok: false, problem: 'nothing answered on port 443' }))
    socket.once('error', err => done({ ok: false, problem: err.message }))
  })
}

export const machineProbes: FrontDoorProbes = { certificate: certificateProbe() }
