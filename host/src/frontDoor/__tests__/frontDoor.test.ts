import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import type { Progress } from '../../sockets/lineServer'
import type { CertificateCheck } from '../probes'
import { FRONT_DOOR_IMAGE } from '../config'

let m: FakeMachine
let busy: Set<number>
let certs: Map<string, CertificateCheck>
let progress: Progress[]

beforeEach(async () => {
  m = fakeMachine()
  busy = new Set()
  certs = new Map()
  progress = []
  m.ctx.portInUse = async port => busy.has(port)
  m.ctx.frontDoorProbes = {
    certificate: async host => certs.get(host) ?? { ok: false, problem: 'connect ECONNREFUSED 127.0.0.1:443' },
  }
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.calls.length = 0
})
afterEach(() => m.cleanup())

const ask = (request: unknown) => ownerHandler(m.ctx)(request, p => progress.push(p)) as Promise<Record<string, unknown>>
const on = (extra: Record<string, unknown> = {}) => ask({ op: 'frontDoor.set', on: true, confirmPorts: true, ...extra })
const read = (...parts: string[]) => fs.readFileSync(m.ctx.state.path(...parts), 'utf8')
const exists = (...parts: string[]) => fs.existsSync(m.ctx.state.path(...parts))
const started = () => m.calls.filter(c => c[0] === 'compose' && c.includes('up')).map(c => c[c.indexOf('-p') + 1])
const hqSettings = () => JSON.parse(read('hq', 'settings.json'))
const valid = (expiresAt = '2027-01-10T00:00:00.000Z'): CertificateCheck => ({ ok: true, expiresAt })

describe('agenthix front-door on @SC-857', () => {
  it('serves HQ and its uploaded files from their own certificates, after checking the configuration', async () => {
    certs.set('hq.acme.example', valid()).set('files.hq.acme.example', valid())
    const answer = await on()
    expect(answer).toMatchObject({ ok: true, result: { on: true } })

    const check = m.calls.find(c => c[0] === 'exec')!
    expect(check).toEqual(['exec', '-i', 'agenthix-hq-web', 'caddy', 'validate', '--config', '/dev/stdin', '--adapter', 'caddyfile'])
    const caddy = read('front-door', 'Caddyfile')
    expect(caddy).toContain('admin off')
    expect(caddy).toContain('hq.acme.example, files.hq.acme.example {\n\treverse_proxy agenthix-hq-web:4100\n}')

    const compose = JSON.parse(read('front-door', 'compose.json'))
    const door = compose.services['front-door']
    expect(door.image).toBe(FRONT_DOOR_IMAGE)
    expect(door.ports).toEqual(['80:80', '443:443'])
    expect(door.networks).toEqual(['edge'])
    expect(compose.networks.edge).toEqual({ name: 'agenthix-edge', external: true })
    expect(JSON.stringify(door.volumes)).not.toContain('docker.sock')
    expect(door.volumes[0]).toBe('/home/sam/.agenthix/front-door/Caddyfile:/etc/caddy/Caddyfile:ro')

    expect(started()).toEqual(['agenthix-front-door'])
    expect(hqSettings().filesOrigin).toBe('https://files.hq.acme.example')
    expect(progress.filter(p => p.event === 'stepDone').map(p => (p as { outcome: string }).outcome))
      .toEqual(['passes', 'started', 'obtained', 'obtained'])
    expect(JSON.parse(read('front-door', 'settings.json'))).toMatchObject({ on: true, hosts: ['hq.acme.example', 'files.hq.acme.example'] })
  })

  it('gives uploaded files another host when asked, and starts HQ again with it', async () => {
    certs.set('hq.acme.example', valid()).set('uploads.acme-files.example', valid())
    expect(await on({ filesHost: 'uploads.acme-files.example' })).toMatchObject({ ok: true })
    expect(hqSettings().filesOrigin).toBe('https://uploads.acme-files.example')
    expect(JSON.parse(read('hq', 'compose.json')).services['hq-server'].environment.FILES_ORIGIN).toBe('https://uploads.acme-files.example')
    expect(started()).toEqual(['agenthix-hq', 'agenthix-front-door'])
  })

  it('is refused while either port is in use, naming who holds it, and nothing changes', async () => {
    busy.add(443)
    m.machineContainers.push({ name: 'nginx', labels: {}, running: true, published: [{ ip: '0.0.0.0', port: 80 }] })
    const answer = await on()
    expect(answer).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    expect((answer.refusal as { message: string }).message).toBe(
      'Refused on hq-box: Port 80, for the front door, is held by the container nginx. Port 443, for the front door, is held by a ' +
      'program on this machine, not by a container. Free them first — or, if it is a web server of your own, keep it and point it ' +
      'at HQ on 127.0.0.1:7800: agenthix front-door prints the steps. Nothing was changed.')
    // Only Docker's listing was read.
    expect(m.calls.filter(c => c[0] !== 'ps' && c[0] !== 'inspect')).toEqual([])
    expect(exists('front-door')).toBe(false)
  })

  it('is refused when Caddy does not pass its configuration, before anything is written or started', async () => {
    m.caddyRefuses.reason = 'Error: adapting config using caddyfile: unrecognized directive'
    const answer = await on()
    expect((answer.refusal as { message: string }).message).toContain("does not pass Caddy's check (Error: adapting config")
    expect(started()).toEqual([])
    expect(exists('front-door', 'Caddyfile')).toBe(false)
  })

  it('rolls back when a certificate cannot be had: the front door stops, its files go, and HQ is as it was', async () => {
    const hqBefore = read('hq', 'settings.json')
    const composeBefore = read('hq', 'compose.json')
    certs.set('hq.acme.example', valid())
    const answer = await on({ filesHost: 'uploads.acme-files.example' })
    expect(answer).toMatchObject({ ok: false, refusal: { code: 'failed' } })
    expect((answer.refusal as { message: string }).message).toBe(
      'Rolled back. The front door is off, ports 80 and 443 are free again, and HQ is as it was. ' +
      'Point uploads.acme-files.example at hq-box, then run this again.')
    expect(m.calls.some(c => c[0] === 'compose' && c.includes('agenthix-front-door') && c.includes('stop'))).toBe(true)
    expect(m.up.has('agenthix-front-door')).toBe(false)
    expect(exists('front-door', 'Caddyfile')).toBe(false)
    expect(read('hq', 'settings.json')).toBe(hqBefore)
    expect(read('hq', 'compose.json')).toBe(composeBefore)
    expect(started().filter(p => p === 'agenthix-hq')).toHaveLength(2)
    expect(progress).toContainEqual({ event: 'stepDone', outcome: 'fails' })
  })

  it('is refused for an HQ at a plain http address', async () => {
    const other = fakeMachine()
    try {
      await install(other.ctx, { address: 'http://192.168.1.20:4100' }, () => {})
      const answer = await ownerHandler(other.ctx)({ op: 'frontDoor.set', on: true, confirmPorts: true }, () => {}) as Record<string, unknown>
      expect((answer.refusal as { message: string }).message).toContain('is plain http')
    } finally {
      other.cleanup()
    }
  })
})

describe('agenthix front-door off @SC-857', () => {
  it('stops it and frees the ports, keeping uploaded files at their address', async () => {
    certs.set('hq.acme.example', valid()).set('files.hq.acme.example', valid())
    await on()
    expect(await ask({ op: 'frontDoor.set', on: false })).toMatchObject({ ok: true, result: { on: false } })
    expect(m.up.has('agenthix-front-door')).toBe(false)
    expect(JSON.parse(read('front-door', 'settings.json')).on).toBe(false)
    expect(hqSettings().filesOrigin).toBe('https://files.hq.acme.example')
  })
})

describe("the front door in the machine's figures and status @SC-857", () => {
  it('gives the earliest expiry, and a renewal problem when one is near and not renewed', async () => {
    certs.set('hq.acme.example', valid('2027-01-10T00:00:00.000Z')).set('files.hq.acme.example', valid('2026-12-01T00:00:00.000Z'))
    await on()
    let figures = (await ask({ op: 'figures.read' })).result as { frontDoor: unknown }
    expect(figures.frontDoor).toEqual({ on: true, certificateExpiresAt: '2026-12-01T00:00:00.000Z', renewalProblem: null })
    certs.set('files.hq.acme.example', valid('2026-10-20T00:00:00.000Z'))
    figures = (await ask({ op: 'figures.read' })).result as { frontDoor: unknown }
    expect(figures.frontDoor).toMatchObject({ renewalProblem: 'files.hq.acme.example: its certificate expires on 2026-10-20 and has not renewed' })
  })

  it('shows in the status what it serves', async () => {
    certs.set('hq.acme.example', valid()).set('files.hq.acme.example', valid())
    await on()
    const status = (await ask({ op: 'machine.status' })).result as { frontDoor: unknown }
    expect(status.frontDoor).toEqual({ on: true, hosts: ['hq.acme.example', 'files.hq.acme.example'] })
  })
})
