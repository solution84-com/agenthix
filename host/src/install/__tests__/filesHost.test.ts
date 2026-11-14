/**
 * A files host a person names (agenthix#273): `install --files <host>` and `hq files-address <host>`, checked as
 * `front-door on --files` checks its host, and kept through a demo reset, the front door, an upgrade, a new address
 * and a move's restore.
 */
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../install'
import { setFilesAddress } from '../filesAddress'
import { filesOfAddress } from '../address'
import { moveHqAddress } from '../hqAddress'
import { installed } from '../../service/context'
import { resetDemo } from '../../demo/reset'
import { upgrade } from '../../upgrades/upgrade'
import '../../upgrades/operations'
import { ownerHandler } from '../../owner/dispatch'
import { parseOwnerRequest } from '../../owner/requests'
import { parseCommand } from '../../cli/commands'
import { filesAddressDone } from '../../cli/filesAddress'
import { installDone } from '../../cli/messages'
import type { CertificateCheck } from '../../frontDoor/probes'
import type { HqStatusData } from '../../hq/control'

let m: FakeMachine
afterEach(() => m.cleanup())

const valid: CertificateCheck = { ok: true, expiresAt: '2027-01-10T00:00:00.000Z' }
const env = (service: string) => (JSON.parse(fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8')) as
  { services: Record<string, { environment: Record<string, string> }> }).services[service].environment
const filesEverywhere = () => ['hq-server', 'relay', 'hq-web'].map(s => env(s).FILES_ORIGIN)
const ask = (request: unknown) => ownerHandler(m.ctx)(request, () => {}) as Promise<Record<string, unknown>>
const DEMO = 'https://demo.acme.example'
const installDemo = (filesHost?: string) => install(m.ctx, { address: DEMO, hqPort: 7810, demo: true, ...(filesHost ? { filesHost } : {}) }, () => {})

function frontDoorReady(hosts: string[]) {
  const certs = new Map(hosts.map(h => [h, valid]))
  m.ctx.portInUse = async () => false
  m.ctx.frontDoorProbes = { certificate: async host => certs.get(host) ?? { ok: false, problem: 'connect ECONNREFUSED' } }
}

describe('install --files <host>', () => {
  beforeEach(() => { m = fakeMachine('demo') })

  it("serves a demo's files from the host named, in hq-server, the relay and hq-web, and says so in its summary", async () => {
    const r = await installDemo('demo-files.acme.example')
    expect(filesEverywhere()).toEqual(Array(3).fill('https://demo-files.acme.example'))
    expect(installed(m.ctx).hq!.settings).toMatchObject({ filesOrigin: 'https://demo-files.acme.example', filesChosen: true })
    expect(r.filesOrigin).toBe('https://demo-files.acme.example')
    expect(installDone(r, 'box').replace(/\s+/g, ' ')).toContain('https://demo-files.acme.example, where uploaded files are served')
  })

  it('records the default host as no choice of its own', async () => {
    await install(m.ctx, { address: 'https://hq.acme.example', filesHost: 'files.hq.acme.example' }, () => {})
    expect(installed(m.ctx).hq!.settings.filesOrigin).toBe('https://files.hq.acme.example')
    expect(installed(m.ctx).hq!.settings.filesChosen).toBeUndefined()
  })

  it("is http on a plain-http address, with HQ's port", async () => {
    await install(m.ctx, { address: 'http://hq.acme.example:8080', filesHost: 'up.acme.example' }, () => {})
    expect(env('hq-web').FILES_ORIGIN).toBe('http://up.acme.example:8080')
  })

  it("refuses HQ's own host, a name no certificate can be had for and a local address, before touching Docker", async () => {
    for (const [address, host, why] of [
      [DEMO, 'demo.acme.example', "HQ's own host"],
      [DEMO, 'files', 'not a host name'],
      [DEMO, '10.0.0.4', 'network address'],
      ['http://localhost:4100', 'files.acme.example', 'files.localhost'],
    ]) {
      await expect(install(m.ctx, { address, filesHost: host }, () => {})).rejects.toMatchObject({ code: 'malformed', message: expect.stringContaining(why) })
    }
    expect(m.calls).toEqual([])
  })

  it('refuses another host on a re-run, naming the command that changes it, and takes the same one', async () => {
    await installDemo('demo-files.acme.example')
    await expect(installDemo('other.acme.example')).rejects.toMatchObject({ code: 'already_installed', message: expect.stringContaining('hq files-address other.acme.example') })
    await installDemo('demo-files.acme.example')
    expect(env('hq-server').FILES_ORIGIN).toBe('https://demo-files.acme.example')
  })

  it('is a command line and an owner request', () => {
    expect(parseCommand(['install', '--demo', '--address', DEMO, '--files', 'Demo-Files.acme.example'])).toMatchObject({ kind: 'install', demo: true, filesHost: 'demo-files.acme.example' })
    expect(parseCommand(['install', '--files'])).toMatchObject({ kind: 'usage' })
    expect(parseOwnerRequest({ op: 'machine.install', address: DEMO, filesHost: 'demo-files.acme.example' })).toMatchObject({ ok: true, request: { filesHost: 'demo-files.acme.example' } })
    expect(parseOwnerRequest({ op: 'machine.install', address: DEMO, filesHost: 7 })).toMatchObject({ ok: false })
  })
})

describe('hq files-address <host>', () => {
  beforeEach(() => { m = fakeMachine('demo') })

  it('rewrites FILES_ORIGIN, starts HQ again, and says to run add-installation again on a neighbour', async () => {
    await installDemo()
    expect(env('hq-server').FILES_ORIGIN).toBe('https://files.demo.acme.example')
    m.calls.length = 0
    const r = await ask({ op: 'hq.filesAddress', host: 'demo-files.acme.example' })
    expect(r).toMatchObject({ ok: true, result: { filesOrigin: 'https://demo-files.acme.example', frontDoor: false, namespace: 'demo' } })
    expect(filesEverywhere()).toEqual(Array(3).fill('https://demo-files.acme.example'))
    expect(m.calls.some(c => c[0] === 'compose' && c.includes('demo-hq') && c.includes('up'))).toBe(true)
    const words = filesAddressDone((r as { result: Parameters<typeof filesAddressDone>[0] }).result).replace(/\s+/g, ' ')
    expect(words).toContain('front-door add-installation demo')
  })

  it('refuses the host it has, HQ\'s own, a bad name, and an HQ that is not here, changing nothing', async () => {
    expect(await ask({ op: 'hq.filesAddress', host: 'x.acme.example' })).toMatchObject({ ok: false, refusal: { code: 'not_installed' } })
    await installDemo('demo-files.acme.example')
    const before = fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8')
    m.calls.length = 0
    expect(await ask({ op: 'hq.filesAddress', host: 'demo-files.acme.example' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    expect(await ask({ op: 'hq.filesAddress', host: 'demo.acme.example' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(await ask({ op: 'hq.filesAddress', host: 'nothing' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8')).toBe(before)
    expect(m.calls).toEqual([])
  })

  it('puts everything back when HQ does not start again with it', async () => {
    await installDemo()
    const before = fs.readFileSync(m.ctx.state.path('hq', 'settings.json'), 'utf8')
    m.dockerFails.add('compose -p')
    await expect(setFilesAddress(m.ctx, 'demo-files.acme.example', () => {})).rejects.toMatchObject({ code: 'failed' })
    expect(fs.readFileSync(m.ctx.state.path('hq', 'settings.json'), 'utf8')).toBe(before)
  })

  it('with the front door on, gives the front door the new host and its certificate', async () => {
    frontDoorReady(['demo.acme.example', 'files.demo.acme.example', 'demo-files.acme.example'])
    await installDemo()
    await ask({ op: 'frontDoor.set', on: true, confirmPorts: true })
    const r = await ask({ op: 'hq.filesAddress', host: 'demo-files.acme.example' })
    expect(r).toMatchObject({ ok: true, result: { frontDoor: true, filesOrigin: 'https://demo-files.acme.example' } })
    expect(fs.readFileSync(m.ctx.state.path('front-door', 'Caddyfile'), 'utf8')).toContain('demo.acme.example, demo-files.acme.example {')
    expect(installed(m.ctx).hq!.settings.filesChosen).toBe(true)
  })

  it('is a command line', () => {
    expect(parseCommand(['hq', 'files-address', 'Demo-Files.acme.example'])).toEqual({ kind: 'hqFilesAddress', host: 'demo-files.acme.example' })
    expect(parseCommand(['hq', 'files-address'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['hq', 'files-address', 'https://x.example.com'])).toMatchObject({ kind: 'usage' })
    expect(parseOwnerRequest({ op: 'hq.filesAddress' })).toMatchObject({ ok: false })
  })
})

describe('a chosen files host is kept', () => {
  beforeEach(() => { m = fakeMachine('demo') })

  it('through a demo reset', async () => {
    await installDemo('demo-files.acme.example')
    await resetDemo(m.ctx, true, () => {})
    expect(filesEverywhere()).toEqual(Array(3).fill('https://demo-files.acme.example'))
  })

  it('when the front door is turned on without --files', async () => {
    frontDoorReady(['demo.acme.example', 'demo-files.acme.example'])
    await installDemo('demo-files.acme.example')
    expect(await ask({ op: 'frontDoor.set', on: true, confirmPorts: true })).toMatchObject({ ok: true })
    expect(fs.readFileSync(m.ctx.state.path('front-door', 'Caddyfile'), 'utf8')).toContain('demo.acme.example, demo-files.acme.example {')
    expect(installed(m.ctx).hq!.settings).toMatchObject({ filesOrigin: 'https://demo-files.acme.example', filesChosen: true })
  })

  it("through an upgrade's rewrite of the services", async () => {
    await install(m.ctx, { address: 'https://hq.acme.example', filesHost: 'hq-files.acme.example' }, () => {})
    const status = (m.hq.status as unknown as { data: HqStatusData }).data
    m.hq.status = { ok: true, text: 'HQ', data: { ...status, version: '0.2.1' } }
    expect(await upgrade(m.ctx, 'hq', '0.2.1', () => {})).toEqual({ version: '0.2.1', rolledBack: false })
    expect(filesEverywhere()).toEqual(Array(3).fill('https://hq-files.acme.example'))
    expect(installed(m.ctx).hq!.settings.filesChosen).toBe(true)
  })

  it('through a new address, where the default one follows the address', async () => {
    await install(m.ctx, { address: 'http://hq.acme.example:4100', filesHost: 'up.acme.example' }, () => {})
    const NEW = 'http://hq.other.example:4100'
    m.hq['address-move'] = { ok: true, text: 'told', data: { sites: { told: 0, of: 0 }, hosts: { told: 0, of: 0 }, console: false } }
    m.hq.status = { ok: true, text: 'HQ', data: { users: 1, hqSite: { state: 'connected', dockerRunning: true }, address: NEW, version: 'dev', commit: 'c' } }
    await moveHqAddress(m.ctx, NEW, () => {})
    expect(env('hq-web').FILES_ORIGIN).toBe('http://up.acme.example:4100')
  })

  it("on a move's restore at a new address, unless it is the new address's own host", () => {
    const chosen = { filesOrigin: 'https://demo-files.acme.example', filesChosen: true as const }
    expect(filesOfAddress('https://demo.new.example', chosen)).toEqual(chosen)
    expect(filesOfAddress('https://demo-files.acme.example', chosen)).toEqual({ filesOrigin: 'https://files.demo-files.acme.example', filesChosen: undefined })
    expect(filesOfAddress('https://demo.new.example', { filesOrigin: 'https://files.demo.acme.example' })).toEqual({ filesOrigin: 'https://files.demo.new.example', filesChosen: undefined })
  })
})
