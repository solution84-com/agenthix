import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import type { Progress } from '../../sockets/lineServer'
import type { CertificateCheck } from '../probes'
import { caddyfile } from '../config'
import { namesFor } from '../../state/namespace'
import { parseCommand } from '../../cli/commands'

let m: FakeMachine
let certs: Map<string, CertificateCheck>
let progress: Progress[]
const valid: CertificateCheck = { ok: true, expiresAt: '2027-01-10T00:00:00.000Z' }

const demoHqWeb = (labels: Record<string, string> = { 'demo.managed-by': 'host', 'demo.role': 'hq', 'demo.ports': '7810', 'demo.demo': 'true' }) => {
  m.machineContainers.push({ name: 'demo-hq-web', labels, running: true, published: [{ ip: '127.0.0.1', port: 7810 }] })
  m.containerEnvs.set('demo-hq-web', ['HQ_URL=https://demo.acme.example', 'FILES_ORIGIN=https://files.demo.acme.example', 'PATH=/usr/bin'])
}

beforeEach(async () => {
  m = fakeMachine()
  certs = new Map([['hq.acme.example', valid], ['files.hq.acme.example', valid], ['demo.acme.example', valid], ['files.demo.acme.example', valid]])
  progress = []
  m.ctx.portInUse = async () => false
  m.ctx.frontDoorProbes = { certificate: async host => certs.get(host) ?? { ok: false, problem: 'connect ECONNREFUSED' } }
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
})
afterEach(() => m.cleanup())

const ask = (request: unknown) => ownerHandler(m.ctx)(request, p => progress.push(p)) as Promise<Record<string, unknown>>
const read = (...parts: string[]) => fs.readFileSync(m.ctx.state.path(...parts), 'utf8')
const turnOn = () => ask({ op: 'frontDoor.set', on: true, confirmPorts: true })
const add = (namespace = 'demo') => ask({ op: 'frontDoor.installation', namespace })

describe('front-door add-installation @SC-1998', () => {
  it('serves a demo beside this HQ: its own block, its files as downloads, its edge network joined, a certificate for each host', async () => {
    demoHqWeb()
    await turnOn()
    m.calls.length = 0
    expect(await add()).toMatchObject({ ok: true, result: { installations: ['demo'] } })
    const caddy = read('front-door', 'Caddyfile')
    expect(caddy).toContain('hq.acme.example, files.hq.acme.example {\n\treverse_proxy agenthix-hq-web:4100\n}')
    expect(caddy).toContain([
      'demo.acme.example, files.demo.acme.example {',
      '\t@files host files.demo.acme.example',
      '\theader @files {',
      '\t\t?Content-Disposition attachment',
      '\t\tContent-Disposition inline attachment',
      '\t\tX-Content-Type-Options nosniff',
      '\t\tdefer',
      '\t}',
      '\treverse_proxy demo-hq-web:4100',
      '}',
    ].join('\n'))
    const compose = JSON.parse(read('front-door', 'compose.json'))
    expect(compose.services['front-door'].networks).toEqual(['edge', 'edge-demo'])
    expect(compose.networks['edge-demo']).toEqual({ name: 'demo-edge', external: true })
    expect(compose.services['front-door'].ports).toEqual(['80:80', '443:443'])
    expect(JSON.parse(read('front-door', 'settings.json'))).toMatchObject({ installations: ['demo'] })
    expect(progress.filter(p => p.event === 'step').map(p => (p as { step: string }).step)).toContain('Certificate for files.demo.acme.example')
  })

  it("keeps serving it when the front door's own settings are written again", async () => {
    demoHqWeb()
    await turnOn()
    await add()
    await turnOn()
    expect(read('front-door', 'Caddyfile')).toContain('reverse_proxy demo-hq-web:4100')
  })

  it('stops serving it with remove-installation', async () => {
    demoHqWeb()
    await turnOn()
    await add()
    expect(await ask({ op: 'frontDoor.installation', namespace: 'demo', remove: true })).toMatchObject({ ok: true, result: { installations: [] } })
    expect(read('front-door', 'Caddyfile')).not.toContain('demo')
  })

  it('refuses an installation whose hq-web its host service did not start, and changes nothing', async () => {
    demoHqWeb({ 'demo.role': 'hq' })
    await turnOn()
    const before = read('front-door', 'Caddyfile')
    expect(await add()).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    expect(read('front-door', 'Caddyfile')).toBe(before)
  })

  it('refuses this installation, a name that is no namespace, and a front door that is off', async () => {
    expect(await add()).toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringMatching(/front door is off/) } })
    await turnOn()
    expect(await add('agenthix')).toMatchObject({ ok: false })
    expect(await add('Demo; rm -rf /')).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
  })

  it('rolls back when a certificate for the other installation cannot be had', async () => {
    demoHqWeb()
    await turnOn()
    const before = read('front-door', 'Caddyfile')
    certs.delete('files.demo.acme.example')
    expect(await add()).toMatchObject({ ok: false, refusal: { code: 'failed' } })
    expect(read('front-door', 'Caddyfile')).toBe(before)
  })

  it('serves a non-demo installation without the download headers', async () => {
    demoHqWeb({ 'demo.managed-by': 'host', 'demo.role': 'hq' })
    await turnOn()
    await add()
    expect(read('front-door', 'Caddyfile')).not.toContain('Content-Disposition')
  })

  it('is a front-door command line', () => {
    expect(parseCommand(['front-door', 'add-installation', 'demo'])).toEqual({ kind: 'frontDoorInstallation', namespace: 'demo', remove: false })
    expect(parseCommand(['front-door', 'remove-installation', 'demo'])).toEqual({ kind: 'frontDoorInstallation', namespace: 'demo', remove: true })
    expect(parseCommand(['front-door', 'add-installation'])).toMatchObject({ kind: 'usage' })
  })
})

describe("a demo's own front door @SC-1998", () => {
  it('serves its files host as downloads; any other installation gets the same Caddyfile as before', () => {
    const names = namesFor('agenthix')
    const plain = caddyfile(names, ['hq.acme.example', 'files.hq.acme.example'])
    expect(caddyfile(names, ['hq.acme.example', 'files.hq.acme.example'], false, null, {})).toBe(plain)
    expect(plain).not.toContain('header')
    const demo = caddyfile(names, ['demo.acme.example', 'files.demo.acme.example'], false, null, { demoFilesHost: 'files.demo.acme.example' })
    expect(demo).toContain('\t@files host files.demo.acme.example\n\theader @files {')
  })
})
