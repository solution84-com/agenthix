import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EnvelopeReplayGuard } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { hostKeys } from '../../identity/identity'
import { install } from '../../install/install'
import { controllerOperation } from '../../owner/controller'
import { envelopeHandler } from '../envelopes'
import { disconnectConsole, forgetConsole } from '../manage'
import { readPin, writePin } from '../pin'
import { FakeConsole } from './fakeRelay'

let m: FakeMachine
let fleetConsole: FakeConsole
let stopped: number

beforeEach(async () => {
  m = fakeMachine()
  fleetConsole = await FakeConsole.make()
  stopped = 0
  // HQ cannot be reached at all.
  m.ctx.dial = () => { throw new Error('unreachable') }
  m.ctx.link = { start: () => {}, stop: () => { stopped++ }, connected: () => false, sendEnvelope: () => {} }
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
  })
})
afterEach(() => m.cleanup())

const fleetAdmin = { kind: 'fleetAdmin', userId: 'u1', name: 'Avery Chen' } as const

async function managedSite() {
  const pin = readPin(m.ctx.state)!
  return controllerOperation(m.ctx, { op: 'install', target: 'site', version: '0.2.0' }, fleetAdmin, pin)
}

describe('console disconnect @SC-848', () => {
  it('forgets the pin and the credential at once, with HQ and the Fleet Console unreachable, and closes the link', async () => {
    const r = await disconnectConsole(m.ctx)
    expect(r.machine).toBe('hq-box')
    expect(readPin(m.ctx.state)).toBeNull()
    expect(fs.existsSync(m.ctx.state.path('link', 'console.json'))).toBe(false)
    expect(stopped).toBe(1)
  })

  it('refuses every envelope after it, even one sent before', async () => {
    const asked: unknown[] = []
    const handle = envelopeHandler({
      state: m.ctx.state, keys: () => hostKeys(m.ctx.state), replay: new EnvelopeReplayGuard(Date.now() - 120_000),
      operate: async r => { asked.push(r); return { ok: true, op: 'stop', result: { state: 'stopped' } } }, send: () => {}, now: () => Date.now(),
    })
    const env = await fleetConsole.seal((await hostKeys(m.ctx.state)).identity, { kind: 'request', requestId: 'r', by: fleetAdmin, request: { op: 'stop', target: 'site' } })
    await disconnectConsole(m.ctx)
    await handle(env)
    expect(asked).toEqual([])
  })

  it('stops the site the Fleet Console added, keeping its data', async () => {
    expect(await managedSite()).toMatchObject({ ok: true })
    m.calls.length = 0
    expect(await disconnectConsole(m.ctx, async () => { throw new Error('unreachable') })).toMatchObject({ siteName: 'hq-box' })
    expect(m.calls.some(c => c[0] === 'compose' && c.includes('stop') && c.includes('agenthix-site'))).toBe(true)
    expect(m.calls.some(c => c.includes('down'))).toBe(false)
  })

  it("takes down the agents the site started, which nothing would end while it is stopped @SC-2196", async () => {
    expect(await managedSite()).toMatchObject({ ok: true })
    m.agentContainers.push('agenthix-agent-project-p1-project-rw')
    m.agentNetworks.push('agenthix-agent-net-1')
    await disconnectConsole(m.ctx, async () => { throw new Error('unreachable') })
    expect(m.agentContainers).toEqual([])
    expect(m.agentNetworks).toEqual([])
  })

  it('is what HQ’s revoke does too', async () => {
    await forgetConsole(m.ctx)
    expect(readPin(m.ctx.state)).toBeNull()
  })

  it('says so when there is nothing to disconnect', async () => {
    await disconnectConsole(m.ctx)
    await expect(disconnectConsole(m.ctx)).rejects.toThrow('hq-box is not managed by a Fleet Console: there is nothing to disconnect.')
  })

  it('is refused on HQ’s machine, which cannot leave', async () => {
    await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
    await expect(disconnectConsole(m.ctx)).rejects.toThrow(/Not here: hq-box is where HQ runs, with its site, so it cannot leave\. .*agenthix hq erase/)
  })
})

describe('the site a Fleet Console starts on a machine it connected (join step 5)', () => {
  it('starts with a credential the machine made, answers only its hash, and dials HQ’s address with it', async () => {
    const r = await managedSite()
    expect(r.ok).toBe(true)
    const { credentialHash } = (r as unknown as { result: { credentialHash: string } }).result
    const stored = JSON.parse(fs.readFileSync(m.ctx.state.path('site', 'credential.json'), 'utf8')) as { credential: string }
    const { createHash } = await import('node:crypto')
    expect(credentialHash).toBe(createHash('sha256').update(stored.credential).digest('hex'))
    expect(fs.statSync(m.ctx.state.path('site', 'credential.json')).mode & 0o777).toBe(0o600)
    const compose = JSON.parse(fs.readFileSync(m.ctx.state.path('site', 'compose.json'), 'utf8'))
    expect(compose.services.site.environment).toMatchObject({ HQ_URL: 'https://hq.acme.example', HQ_PAIRING_SECRET: stored.credential })
    expect(compose.services.site.networks).toEqual(['internal'])
    expect(compose.networks.link).toBeUndefined()
    expect(JSON.stringify(r)).not.toContain(stored.credential)
  })

  it('makes a new credential each time it is asked, keeping the site and its name', async () => {
    const first = await managedSite()
    const second = await managedSite()
    expect((first as unknown as { result: { credentialHash: string } }).result.credentialHash).not.toBe((second as unknown as { result: { credentialHash: string } }).result.credentialHash)
  })

  it('keeps its own connection through an upgrade’s rewrite of its compose file', async () => {
    await managedSite()
    const { writeProjects } = await import('../../upgrades/rollback')
    const site = JSON.parse(fs.readFileSync(m.ctx.state.path('site', 'settings.json'), 'utf8'))
    await writeProjects(m.ctx, null, site, { state: '/home/sam/.agenthix' })
    const compose = JSON.parse(fs.readFileSync(m.ctx.state.path('site', 'compose.json'), 'utf8'))
    expect(compose.services.site.environment.HQ_URL).toBe('https://hq.acme.example')
  })

  it('refuses HQ from a controller on a machine that carries a site', async () => {
    await managedSite()
    const r = await controllerOperation(m.ctx, { op: 'install', target: 'hq', version: '0.2.0', address: 'https://evil.example' }, fleetAdmin, readPin(m.ctx.state)!)
    expect(r).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
  })
})
