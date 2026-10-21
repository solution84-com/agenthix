import type net from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { requestControl } from '../control/client'
import { startControlSocket } from '../control/socket'
import { startHarness, type Harness } from './harness'
import { base32Decode, hotp } from '../auth/totp'
import { certificateFor, freePort, inHours, NAME, remoteRequest } from './remoteHelpers'

let h: Harness
let control: net.Server
let socketPath: string

beforeEach(async () => {
  h = await startHarness()
  socketPath = h.state.path('control.sock')
  control = await startControlSocket(socketPath, h.ctx)
})
afterEach(async () => {
  await new Promise(r => control.close(r))
  await h.close()
})

const hashes = Array.from({ length: 10 }, (_, i) => i.toString(16).repeat(64))

describe('remote access, asked through the control socket as the host service asks it @SC-1070', () => {
  it('makes a request, turns on with its certificate, says it is on, and turns off', async () => {
    const { csr } = await requestControl(socketPath, 'remote-csr', { payload: { name: NAME } })
    expect(csr).toMatch(/^-----BEGIN CERTIFICATE REQUEST-----/)
    const port = await freePort()
    const certificate = certificateFor(h.state.readText('remote-access', 'key.next.pem')!, NAME)
    const until = inHours(1)
    const on = await requestControl(socketPath, 'remote-on', { payload: { name: NAME, port, certificate, until, allow: ['127.0.0.1/32'] } })
    expect(on).toEqual({ on: true, until })
    expect(await requestControl(socketPath, 'remote-status')).toMatchObject({ on: true, port, until })
    expect((await remoteRequest(port, '/api/sign-in/remote')).json).toEqual({ remote: true })
    expect(await requestControl(socketPath, 'remote-off')).toEqual({ on: false })
    await expect(remoteRequest(port, '/api/status')).rejects.toThrow()
  })

  it('refuses what is not valid, in words', async () => {
    await expect(requestControl(socketPath, 'remote-csr', { payload: { name: '*.example' } })).rejects.toThrow('The name is not a DNS name.')
    await expect(requestControl(socketPath, 'remote-on', { payload: { name: NAME, port: 443, certificate: '', until: inHours(1), allow: [] } })).rejects.toThrow(/port/)
    await expect(requestControl(socketPath, 'remote-on')).rejects.toThrow('The request carries nothing to act on.')
  })

  it('keeps an authenticator unclaimed, and the same one handed over again is answered as added', async () => {
    const payload = { id: 'a-1', secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEH', recoveryCodeHashes: hashes, claimBefore: inHours(24) }
    expect(await requestControl(socketPath, 'remote-authenticator-add', { payload })).toEqual({ added: true })
    expect(await requestControl(socketPath, 'remote-authenticator-add', { payload })).toEqual({ added: true })
    expect(await requestControl(socketPath, 'remote-authenticator-add', { payload: { ...payload, secret: 'KRSXG5CTMVRXEZLUKN2XAZLSKNSWG4TFOQ' } })).toEqual({ added: false })
    expect(h.ctx.authenticators.hasOwn('u-sam')).toBe(false)
    const stored = h.state.readJson('authenticators.json') as { authenticators: { claimedBy: string | null }[] }
    expect(stored.authenticators).toEqual([expect.objectContaining({ id: 'a-1', claimedBy: null })])
    await expect(requestControl(socketPath, 'remote-authenticator-add', { payload: { ...payload, id: 'a-2', recoveryCodeHashes: hashes.slice(1) } })).rejects.toThrow(/10 different/)
  })

  it("resets a fleet admin's own authenticator, so they set one up again; another's is left alone @SC-1126", async () => {
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEH'
    await requestControl(socketPath, 'remote-authenticator-add', { payload: { id: 'a-1', secret, recoveryCodeHashes: hashes, claimBefore: inHours(24) } })
    const code = hotp(base32Decode(secret), Math.floor(Date.now() / 30_000))
    expect(h.ctx.authenticators.check('u-sam', { code })).toBe('claimed')
    expect(await requestControl(socketPath, 'remote-authenticator-reset', { payload: { userId: 'u-other' } })).toEqual({ reset: false })
    expect(h.ctx.authenticators.hasOwn('u-sam')).toBe(true)
    expect(await requestControl(socketPath, 'remote-authenticator-reset', { payload: { userId: 'u-sam' } })).toEqual({ reset: true })
    expect(h.ctx.authenticators.hasOwn('u-sam')).toBe(false)
    await expect(requestControl(socketPath, 'remote-authenticator-reset', { payload: {} })).rejects.toThrow(/names no fleet admin/)
  })
})

