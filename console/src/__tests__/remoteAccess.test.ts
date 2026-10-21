import fs from 'node:fs'
import tls from 'node:tls'
import { X509Certificate } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Activity } from '../activity'
import { RemoteAccess } from '../net/remoteAccess'
import { FakeHqLink, tempState } from './fakes'
import { startHarness, type Harness } from './harness'
import { certificateFor, freePort, inHours, NAME, remoteRequest, turnOn } from './remoteHelpers'

const refused = (port: number) => remoteRequest(port, '/api/status').then(() => false, () => true)

let h: Harness
beforeEach(async () => { h = await startHarness() })
afterEach(async () => { await h.close() })

describe('remote access on a machine Cloud runs @SC-1068', () => {
  it('listens with the chain for the key made here, the key kept at 0600, and is announced with its end and addresses', async () => {
    const { port, certificate, answer } = await turnOn(h.ctx.remoteAccess, h.state)
    expect(answer).toEqual({ on: true, until: expect.any(String) })
    expect(fs.statSync(h.state.path('remote-access', 'key.pem')).mode & 0o777).toBe(0o600)
    const res = await remoteRequest(port, '/api/sign-in/remote')
    expect(res.json).toEqual({ remote: true })
    expect(res.certificate.fingerprint256).toBe(new X509Certificate(certificate).fingerprint256)
    const [record] = h.link.callsOf('activity.record').filter(c => c.action === 'remoteAccess.on')
    expect(record).toMatchObject({ byUserId: null, announce: true })
    expect(record!.subject).toContain(answer.until)
    expect(record!.subject).toContain('127.0.0.1/32')
    expect(h.ctx.remoteAccess.status()).toMatchObject({ on: true, name: NAME, port, allow: ['127.0.0.1/32'] })
  })

  it('closes a connection from an address the allow list does not hold, before TLS', async () => {
    const { port } = await turnOn(h.ctx.remoteAccess, h.state, { allow: ['203.0.113.7/32'] })
    const handshake = await new Promise<string>(resolve => {
      const s = tls.connect({ host: '127.0.0.1', port, servername: NAME, rejectUnauthorized: false })
      s.on('secureConnect', () => { s.destroy(); resolve('handshake') })
      s.on('error', () => resolve('closed'))
      s.on('close', () => resolve('closed'))
    })
    expect(handshake).toBe('closed')
  })

  it('refuses a certificate for another key, for another name, or one that ends before remote access would', async () => {
    h.ctx.remoteAccess.csr(NAME)
    const key = h.state.readText('remote-access', 'key.next.pem')!
    const other = h.ctx.remoteAccess
    const port = await freePort()
    const base = { name: NAME, port, until: inHours(2), allow: ['127.0.0.1/32'] }
    const { makeRemoteKey } = await import('../net/csr')
    await expect(other.on({ ...base, certificate: certificateFor(makeRemoteKey(), NAME) })).rejects.toThrow(/not for the key made on this machine/)
    await expect(other.on({ ...base, certificate: certificateFor(key, 'elsewhere.example') })).rejects.toThrow(/not for fc-1/)
    await expect(other.on({ ...base, certificate: certificateFor(key, NAME, { notAfter: new Date(Date.now() + 3600_000) }) })).rejects.toThrow(/ends before/)
    await expect(other.on({ ...base, allow: ['0.0.0.0/0'], certificate: certificateFor(key, NAME) })).rejects.toThrow(/IPv4 \/32/)
    expect(await refused(port)).toBe(true)
    expect(h.ctx.remoteAccess.status()).toEqual({ on: false })
    expect(h.link.callsOf('activity.record').filter(c => c.action === 'remoteAccess.on')).toEqual([])
  })

  it('asked again while on, replaces all of it', async () => {
    const first = await turnOn(h.ctx.remoteAccess, h.state)
    const port = await freePort()
    await h.ctx.remoteAccess.on({ name: NAME, port, certificate: first.certificate, until: inHours(1), allow: ['127.0.0.1/32', '2001:db8::/64'] })
    expect(await refused(first.port)).toBe(true)
    expect((await remoteRequest(port, '/api/sign-in/remote')).json).toEqual({ remote: true })
    expect(h.ctx.remoteAccess.status()).toMatchObject({ port, allow: ['127.0.0.1/32', '2001:db8::/64'] })
  })

  it('asked again on the same port, listens there with what it was given last', async () => {
    const first = await turnOn(h.ctx.remoteAccess, h.state)
    await h.ctx.remoteAccess.on({ name: NAME, port: first.port, certificate: first.certificate, until: inHours(1), allow: ['203.0.113.7/32'] })
    expect(await refused(first.port)).toBe(true)
    await h.ctx.remoteAccess.on({ name: NAME, port: first.port, certificate: first.certificate, until: inHours(1), allow: ['127.0.0.1/32'] })
    expect(await refused(first.port)).toBe(false)
  })

  it('a new request makes a new key, and the one in use serves until a certificate for the new one arrives', async () => {
    const { port, certificate } = await turnOn(h.ctx.remoteAccess, h.state)
    h.ctx.remoteAccess.csr(NAME)
    expect((await remoteRequest(port, '/api/status')).certificate.fingerprint256).toBe(new X509Certificate(certificate).fingerprint256)
  })

  it('off stops it now', async () => {
    const { port } = await turnOn(h.ctx.remoteAccess, h.state)
    expect(await h.ctx.remoteAccess.off()).toEqual({ on: false })
    expect(await refused(port)).toBe(true)
    expect(h.ctx.remoteAccess.status()).toEqual({ on: false })
    expect(h.link.callsOf('activity.record').map(c => c.action)).toContain('remoteAccess.off')
  })
})

describe('remote access ends by itself @SC-1069', () => {
  const app = (_req: unknown, res: { end: (s: string) => void }) => res.end('{}')

  it('at its end, ending what came through it', async () => {
    const state = tempState()
    const link = new FakeHqLink()
    let ended = 0
    const ra = new RemoteAccess({ state, activity: new Activity(link), machineName: 'hq-box', ended: () => { ended++ } })
    await ra.start(app as never, '127.0.0.1')
    ra.csr(NAME)
    const key = state.readText('remote-access', 'key.next.pem')!
    const port = await freePort()
    await ra.on({ name: NAME, port, certificate: certificateFor(key, NAME), until: new Date(Date.now() + 400).toISOString(), allow: ['127.0.0.1/32'] })
    expect(await refused(port)).toBe(false)
    await new Promise(r => setTimeout(r, 600))
    expect(await refused(port)).toBe(true)
    expect(ended).toBe(1)
    expect(fs.existsSync(state.path('remote-access', 'state.json'))).toBe(false)
    expect(link.callsOf('activity.record').map(c => c.action)).toContain('remoteAccess.ended')
  })

  it('comes back after a restart until its end, and not after it', async () => {
    const state = tempState()
    const link = new FakeHqLink()
    const first = new RemoteAccess({ state, activity: new Activity(link), machineName: 'hq-box' })
    await first.start(app as never, '127.0.0.1')
    const { port } = await turnOn(first, state)
    await first.stop()
    expect(await refused(port)).toBe(true)

    const again = new RemoteAccess({ state, activity: new Activity(link), machineName: 'hq-box' })
    await again.start(app as never, '127.0.0.1')
    expect(await refused(port)).toBe(false)
    await again.stop()

    const late = new RemoteAccess({ state, activity: new Activity(link), machineName: 'hq-box', now: () => Date.now() + 3 * 3600_000 })
    await late.start(app as never, '127.0.0.1')
    expect(await refused(port)).toBe(true)
    expect(late.status()).toEqual({ on: false })
    expect(fs.existsSync(state.path('remote-access', 'state.json'))).toBe(false)
  })
})
