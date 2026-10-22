import tls from 'node:tls'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { certificateProbe } from '../probes'
import { madeCertificate } from './madeCertificate'

const HOST = 'hq.acme.example'
let server: tls.Server | null = null

/** A real TLS listener on a free port, serving a self-signed certificate: one no browser trusts. */
async function serving(cert: { certificate: string; privateKey: string }): Promise<number> {
  server = tls.createServer({ cert: cert.certificate, key: cert.privateKey }, socket => socket.end())
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}
afterEach(async () => {
  await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()))
  server = null
})

describe("the front door's certificate check on the machine itself", () => {
  it('fails a certificate no browser trusts when it obtained its own', async () => {
    const port = await serving(madeCertificate([HOST]))
    expect(await certificateProbe(port)(HOST)).toMatchObject({ ok: false })
  })

  it('passes a given certificate no browser trusts when the host is served exactly that one, with its expiry', async () => {
    const given = madeCertificate([HOST])
    const port = await serving(given)
    const got = await certificateProbe(port)(HOST, given.certificate)
    expect(got).toMatchObject({ ok: true })
    expect(got.ok && Date.parse(got.expiresAt)).toBeGreaterThan(Date.now())
  })

  it('fails when the host is served another certificate than the one given', async () => {
    const port = await serving(madeCertificate([HOST]))
    expect(await certificateProbe(port)(HOST, madeCertificate([HOST]).certificate))
      .toEqual({ ok: false, problem: 'it is served with another certificate than the one given' })
  })
})
