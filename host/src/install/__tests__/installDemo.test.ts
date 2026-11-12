import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../install'
import { Refusal } from '../../owner/results'
import { ownerHandler } from '../../owner/dispatch'
import { parseOwnerRequest } from '../../owner/requests'
import { parseCommand } from '../../cli/commands'
import { nightlyTick } from '../../backups/nightly'
import { BackupStore } from '../../backups/store'

let m: FakeMachine
afterEach(() => m.cleanup())

const read = (...parts: string[]) => JSON.parse(fs.readFileSync(m.ctx.state.path(...parts), 'utf8'))
const ups = () => m.calls.filter(c => c[0] === 'compose' && c.includes('up')).map(c => c[c.indexOf('-p') + 1])
const run = (ask: { demo?: boolean; consolePort?: number } = {}) => install(m.ctx, { address: 'https://demo.acme.example', ...ask }, () => {})

describe('install --demo, under a namespace of its own beside another installation @SC-1993', () => {
  beforeEach(() => {
    m = fakeMachine('demo')
    m.machineContainers.push({
      name: 'agenthix-hq-web', labels: { 'agenthix.managed-by': 'host', 'agenthix.role': 'hq', 'agenthix.ports': '7800,7801' },
      running: true, published: [{ ip: '127.0.0.1', port: 7800 }],
    })
  })

  it('writes DEMO_MODE into hq-server, the relay and the site, leaves the Docker socket out of the site, and starts no Fleet Console @SC-1997', async () => {
    const r = await install(m.ctx, { address: 'https://demo.acme.example', hqPort: 7810, demo: true }, () => {})
    expect(ups()).toEqual(['demo-hq', 'demo-site'])
    const hq = read('hq', 'compose.json')
    const site = read('site', 'compose.json')
    expect(hq.services['hq-server'].environment.DEMO_MODE).toBe('true')
    expect(hq.services.relay.environment.DEMO_MODE).toBe('true')
    for (const project of [hq, site]) {
      for (const service of Object.values(project.services) as { logging?: unknown }[]) {
        expect(service.logging).toEqual({ driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } })
      }
    }
    expect(site.services.site.environment.DEMO_MODE).toBe('true')
    expect(JSON.stringify(site)).not.toContain('docker.sock')
    expect(fs.existsSync(m.ctx.state.path('console', 'compose.json'))).toBe(false)
    expect(m.checked.map(([ref]) => ref).some(ref => ref.includes('console'))).toBe(false)
    expect(m.calls.some(c => c.join(' ').includes('agenthix-console'))).toBe(false)
    // Its sample organisation is seeded at start: nobody is given the first account.
    expect(r).toMatchObject({ demo: true, firstAccountLink: null })
    expect(m.calls.some(c => c.includes('invite-admin'))).toBe(false)
  })

  it('publishes only HQ, on a port of its own, and records that it is a demo, which every container carries', async () => {
    // The other installation holds 7800, so the demo is given a port of its own.
    await expect(run({ demo: true })).rejects.toMatchObject({ code: 'conflict' })
    const hq = () => read('hq', 'compose.json')
    await install(m.ctx, { address: 'https://demo.acme.example', hqPort: 7810, demo: true }, () => {})
    expect(read('installation.json')).toMatchObject({ namespace: 'demo', ports: { hq: 7810, console: null }, demo: true })
    expect(hq().services['hq-web'].ports).toEqual(['127.0.0.1:7810:4100'])
    for (const service of Object.values(hq().services) as { labels: Record<string, string>; ports?: string[] }[]) {
      expect(service.labels['demo.demo']).toBe('true')
      expect(service.labels['demo.ports']).toBe('7810')
    }
    const published = [...Object.values(hq().services), ...Object.values(read('site', 'compose.json').services)]
      .flatMap(s => (s as { ports?: string[] }).ports ?? [])
    expect(published).toEqual(['127.0.0.1:7810:4100'])
  })

  it('keeps being a demo when install runs again without --demo', async () => {
    await install(m.ctx, { address: 'https://demo.acme.example', hqPort: 7810, demo: true }, () => {})
    await install(m.ctx, { address: 'https://demo.acme.example' }, () => {})
    expect(read('hq', 'compose.json').services['hq-server'].environment.DEMO_MODE).toBe('true')
    expect(read('installation.json').demo).toBe(true)
  })

  it('refuses --console-port, since a demo has no Fleet Console, before touching Docker', async () => {
    const refused = await run({ demo: true, consolePort: 7811 }).catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(Refusal)
    expect(m.calls).toEqual([])
  })

  it('refuses every Fleet Console command, and the fleet admin role', async () => {
    await install(m.ctx, { address: 'https://demo.acme.example', hqPort: 7810, demo: true }, () => {})
    const handle = ownerHandler(m.ctx)
    const from = m.calls.length
    for (const request of [
      { op: 'console.connect', address: 'https://hq.other.example', code: '7KQ4M2XD46Q3' },
      { op: 'console.install', address: 'https://hq.other.example', code: '7KQ4M2XD46Q3' },
      { op: 'console.port', port: 7812 }, { op: 'console.remove', confirmed: true }, { op: 'console.disconnect' },
      { op: 'hq.consoleCode', confirmed: true }, { op: 'hq.fleetAdmin', user: 'sam' },
    ]) {
      const answer = await handle(request, () => {}, undefined as never)
      expect(answer).toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringMatching(/is a demo/) } })
    }
    expect(m.calls.slice(from)).toEqual([])
  })

  it('takes no nightly backup', async () => {
    await install(m.ctx, { address: 'https://demo.acme.example', hqPort: 7810, demo: true }, () => {})
    await m.ctx.sleep(48 * 3600_000)
    const from = m.calls.length
    expect(await nightlyTick(m.ctx)).toBe(false)
    expect(m.calls.slice(from)).toEqual([])
    expect(new BackupStore(m.ctx.state).log()).toEqual({})
  })
})

describe('install --demo where HQ is already installed @SC-1993', () => {
  beforeEach(() => { m = fakeMachine() })

  it('is refused, changing nothing, when that HQ is not a demo', async () => {
    await run()
    const before = fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8')
    await expect(run({ demo: true })).rejects.toMatchObject({ code: 'already_installed' })
    expect(fs.readFileSync(m.ctx.state.path('hq', 'compose.json'), 'utf8')).toBe(before)
    expect(read('installation.json').demo).toBeUndefined()
  })
})

describe('install without --demo writes what it wrote before @SC-1994', () => {
  beforeEach(() => { m = fakeMachine() })

  it('no demo setting anywhere, the Docker socket in the site, the Fleet Console started, the first account offered', async () => {
    const r = await run()
    expect(Object.keys(read('installation.json')).sort()).toEqual(['agentRange', 'namespace', 'ports', 'recordedAt'])
    for (const file of [['hq', 'compose.json'], ['site', 'compose.json'], ['console', 'compose.json'], ['hq', 'settings.json'], ['site', 'settings.json']]) {
      const text = fs.readFileSync(m.ctx.state.path(...file), 'utf8')
      expect(text).not.toMatch(/DEMO_MODE|"agenthix\.demo"|"logging"/)
    }
    expect(read('site', 'compose.json').services.site.volumes).toContain('/var/run/docker.sock:/var/run/docker.sock')
    expect(ups()).toEqual(['agenthix-hq', 'agenthix-site', 'agenthix-console'])
    expect(r.firstAccountLink).toBe('https://hq.acme.example/setup?token=abc')
    expect(r).not.toHaveProperty('demo')
  })
})

describe('asking for a demo @SC-1993', () => {
  it('is a flag of install on the command line, and demo reset its own command', () => {
    expect(parseCommand(['install', '--demo', '--address', 'https://demo.acme.example', '--yes']))
      .toEqual({ kind: 'install', address: 'https://demo.acme.example', yes: true, demo: true })
    expect(parseCommand(['install'])).toEqual({ kind: 'install', address: undefined, yes: false })
    expect(parseCommand(['demo', 'reset', '--yes'])).toEqual({ kind: 'demoReset', yes: true })
    expect(parseCommand(['demo', 'reset', 'now'])).toMatchObject({ kind: 'usage' })
  })

  it('is rebuilt field by field on the owner socket', () => {
    expect(parseOwnerRequest({ op: 'machine.install', address: 'https://demo.acme.example', demo: true }))
      .toEqual({ ok: true, request: { op: 'machine.install', address: 'https://demo.acme.example', demo: true } })
    expect(parseOwnerRequest({ op: 'machine.install', address: 'https://demo.acme.example', demo: 'yes' })).toMatchObject({ ok: false })
    expect(parseOwnerRequest({ op: 'machine.install', address: 'https://demo.acme.example' }))
      .toEqual({ ok: true, request: { op: 'machine.install', address: 'https://demo.acme.example' } })
    expect(parseOwnerRequest({ op: 'demo.reset', confirmed: 'yes' })).toMatchObject({ ok: false })
  })
})
