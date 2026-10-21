/**
 * What the front door asks of the machine itself: whether a port is taken, and what certificate a host name is
 * served with on this machine's port 443. The host service runs on the machine's own network, so both are the
 * machine's. Tests stand in fakes.
 */
import net from 'node:net'
import tls from 'node:tls'

export type CertificateCheck = { ok: true; expiresAt: string } | { ok: false; problem: string }

export type FrontDoorProbes = {
  /** True when something listens on the port; null when that cannot be told. */
  portInUse: (port: number) => Promise<boolean | null>
  /** The certificate this machine's port 443 serves for `host`, checked as a browser checks it. */
  certificate: (host: string) => Promise<CertificateCheck>
}

function portInUse(port: number): Promise<boolean | null> {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', (err: NodeJS.ErrnoException) => resolve(err.code === 'EADDRINUSE' ? true : null))
    server.listen({ port, host: '0.0.0.0', exclusive: true }, () => server.close(() => resolve(false)))
  })
}

function certificate(host: string): Promise<CertificateCheck> {
  return new Promise(resolve => {
    const socket = tls.connect({ host: '127.0.0.1', port: 443, servername: host, rejectUnauthorized: true, timeout: 10_000 })
    const done = (check: CertificateCheck) => {
      socket.destroy()
      resolve(check)
    }
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate()
      const expires = cert?.valid_to ? new Date(cert.valid_to) : null
      done(expires && !Number.isNaN(expires.getTime())
        ? { ok: true, expiresAt: expires.toISOString() }
        : { ok: false, problem: 'it is served with no certificate a browser accepts' })
    })
    socket.once('timeout', () => done({ ok: false, problem: 'nothing answered on port 443' }))
    socket.once('error', err => done({ ok: false, problem: err.message }))
  })
}

export const machineProbes: FrontDoorProbes = { portInUse, certificate }
