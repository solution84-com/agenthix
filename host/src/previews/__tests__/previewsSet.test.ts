import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import type { Progress } from '../../sockets/lineServer'
import type { CertificateCheck } from '../../frontDoor/probes'

let m: FakeMachine
let certs: Map<string, CertificateCheck>
let dns: Map<string, string[]>
let answers: Set<string>
let progress: Progress[]

const valid: CertificateCheck = { ok: true, expiresAt: '2027-01-10T00:00:00.000Z' }

beforeEach(async () => {
  m = fakeMachine()
  certs = new Map([['hq.acme.example', valid], ['files.hq.acme.example', valid]])
  dns = new Map([['hq.acme.example', ['203.0.113.7']]])
  answers = new Set()
  progress = []
  m.ctx.portInUse = async () => false
  m.ctx.frontDoorProbes = { certificate: async host => certs.get(host) ?? { ok: false, problem: 'connect ECONNREFUSED 127.0.0.1:443' } }
  m.ctx.previewProbes = {
    // The wildcard answers any name under the domain it was set for.
    resolve: async host => dns.get(host) ?? [...dns.entries()].find(([k]) => k.startsWith('*.') && host.endsWith(k.slice(1)))?.[1] ?? [],
    checkAnswer: async host => (answers.has(host) ? { ok: true } : { ok: false, problem: 'it was answered 404, not by the relay' }),
  }
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.calls.length = 0
})
afterEach(() => m.cleanup())

const ask = (request: unknown) => ownerHandler(m.ctx)(request, p => progress.push(p)) as Promise<Record<string, unknown>>
const set = (domain: string | null) => ask({ op: 'previews.set', domain })
const read = (...parts: string[]) => fs.readFileSync(m.ctx.state.path(...parts), 'utf8')
const started = () => m.calls.filter(c => c[0] === 'compose' && c.includes('up')).map(c => c[c.indexOf('-p') + 1])
const env = (service: string) => JSON.parse(read('hq', 'compose.json')).services[service].environment
const refusal = (a: Record<string, unknown>) => (a.refusal as { code: string; message: string })
const allPass = () => {
  dns.set('*.preview.acme.net', ['203.0.113.7'])
  certs.set('p-check.preview.acme.net', valid)
  answers.add('p-check.preview.acme.net')
}

describe("live apps' preview address @SC-1756", () => {
  it('gives hq-server, the relay and hq-web the pattern, starts HQ again with it, and checks all three', async () => {
    allPass()
    const answer = await set('Preview.Acme.Net')
    expect(answer).toMatchObject({ ok: true })
    const previews = (answer.result as { previews: { domain: string; checks: { name: string; ok: boolean }[] } }).previews
    expect(previews.domain).toBe('preview.acme.net')
    expect(previews.checks.map(c => [c.name, c.ok])).toEqual([['dns', true], ['certificate', true], ['testApp', true]])
    expect(JSON.parse(read('hq', 'settings.json')).previewDomain).toBe('preview.acme.net')
    for (const service of ['hq-server', 'relay', 'hq-web']) expect(env(service).PREVIEW_PATTERN).toBe('https://p-{id}.preview.acme.net')
    expect(started()).toEqual(['agenthix-hq'])
    const figures = (await ask({ op: 'figures.read' })).result as { previews: unknown }
    expect(figures.previews).toEqual(previews)
  })

  it('asked again with the same address, changes nothing and checks again', async () => {
    await set('preview.acme.net')
    m.calls.length = 0
    allPass()
    const answer = await set('preview.acme.net')
    expect(started()).toEqual([])
    expect((answer.result as { previews: { checks: { ok: boolean }[] } }).previews.checks.every(c => c.ok)).toBe(true)
  })

  it('says what failed: no wildcard record, no certificate, nothing answering', async () => {
    const answer = await set('preview.acme.net')
    const checks = (answer.result as { previews: { checks: Record<string, unknown>[] } }).previews.checks
    expect(checks).toEqual([
      { name: 'dns', ok: false, addresses: [], expected: ['203.0.113.7'] },
      { name: 'certificate', ok: false, problem: 'connect ECONNREFUSED 127.0.0.1:443' },
      { name: 'testApp', ok: false, problem: 'it was answered 404, not by the relay' },
    ])
    expect(progress.filter(p => p.event === 'stepDone').map(p => (p as { outcome: string }).outcome)).toEqual(['done', 'fails', 'fails', 'fails'])
  })

  it('fails DNS when the wildcard points somewhere other than HQ', async () => {
    dns.set('*.preview.acme.net', ['198.51.100.9'])
    const checks = ((await set('preview.acme.net')).result as { previews: { checks: Record<string, unknown>[] } }).previews.checks
    expect(checks[0]).toEqual({ name: 'dns', ok: false, addresses: ['198.51.100.9'], expected: ['203.0.113.7'] })
  })

  it('turns live apps off with no address, and forgets the checks', async () => {
    allPass()
    await set('preview.acme.net')
    expect(await set(null)).toMatchObject({ ok: true, result: { previews: { domain: null, checkedAt: null, checks: [] } } })
    expect(env('relay').PREVIEW_PATTERN).toBe('')
    const figures = (await ask({ op: 'figures.read' })).result as { previews: unknown }
    expect(figures.previews).toEqual({ domain: null, checkedAt: null, checks: [] })
  })

  it("refuses HQ's own name, a domain over it and what is not a domain, changing nothing", async () => {
    const before = read('hq', 'settings.json')
    expect(refusal(await set('hq.acme.example')).message).toBe("The preview address cannot be hq.acme.example: it is HQ's own address, and live apps need one of their own. Nothing changed.")
    expect(refusal(await set('acme.example')).message).toMatch(/hq\.acme\.example is directly under it/)
    expect(refusal(await set('203.0.113.7')).code).toBe('malformed')
    expect(read('hq', 'settings.json')).toBe(before)
    expect(started()).toEqual([])
  })

  it('needs HQ at an https address with a name', async () => {
    const other = fakeMachine()
    try {
      await install(other.ctx, { address: 'http://192.168.1.20:4100' }, () => {})
      const answer = await ownerHandler(other.ctx)({ op: 'previews.set', domain: 'preview.acme.net' }, () => {}) as Record<string, unknown>
      expect(refusal(answer)).toMatchObject({ code: 'conflict', message: expect.stringContaining('Live apps need a domain') })
    } finally {
      other.cleanup()
    }
  })
})

describe("live apps' certificates through the host service's front door @SC-1757", () => {
  const caddyBlock = '*.preview.acme.net {\n\ttls {\n\t\ton_demand\n\t}\n\treverse_proxy agenthix-hq-web:4100\n}'

  it("gets each app a certificate on first open, only after asking hq, and starts the front door again", async () => {
    expect(await ask({ op: 'frontDoor.set', on: true, confirmPorts: true })).toMatchObject({ ok: true })
    m.calls.length = 0
    allPass()
    expect(await set('preview.acme.net')).toMatchObject({ ok: true })
    const caddy = read('front-door', 'Caddyfile')
    expect(caddy).toContain('\ton_demand_tls {\n\t\task http://agenthix-hq-web:4100/preview-certificate-ask\n\t}')
    expect(caddy).toContain(caddyBlock)
    expect(caddy).toContain('hq.acme.example, files.hq.acme.example {\n\treverse_proxy agenthix-hq-web:4100\n}')
    expect(m.calls.some(c => c[0] === 'exec' && c.includes('validate'))).toBe(true)
    expect(started()).toEqual(['agenthix-hq', 'agenthix-front-door'])
  })

  it('waits for the check name\'s certificate while the front door asks for it', async () => {
    await ask({ op: 'frontDoor.set', on: true, confirmPorts: true })
    let asked = 0
    m.ctx.frontDoorProbes = {
      certificate: async host => (host.startsWith('p-check.') && ++asked < 3 ? { ok: false, problem: 'tlsv1 alert internal error' } : valid),
    }
    const checks = ((await set('preview.acme.net')).result as { previews: { checks: { name: string; ok: boolean }[] } }).previews.checks
    expect(checks[1]).toEqual({ name: 'certificate', ok: true, problem: null })
    expect(asked).toBe(3)
  })

  it("changes nothing when Caddy's check of the new configuration fails", async () => {
    await ask({ op: 'frontDoor.set', on: true, confirmPorts: true })
    const before = read('front-door', 'Caddyfile')
    m.calls.length = 0
    m.caddyRefuses.reason = 'Error: adapting config using caddyfile: unrecognized directive'
    expect(refusal(await set('preview.acme.net')).code).toBe('failed')
    expect(read('front-door', 'Caddyfile')).toBe(before)
    expect(JSON.parse(read('hq', 'settings.json')).previewDomain).toBeUndefined()
    expect(started()).toEqual([])
  })

  it('is set with the front door when frontDoor.set names it, and kept when it is turned on again', async () => {
    allPass()
    expect(await ask({ op: 'frontDoor.set', on: true, confirmPorts: true, previewsHost: 'preview.acme.net' })).toMatchObject({ ok: true })
    expect(read('front-door', 'Caddyfile')).toContain(caddyBlock)
    expect(env('hq-server').PREVIEW_PATTERN).toBe('https://p-{id}.preview.acme.net')
    expect(((await ask({ op: 'figures.read' })).result as { previews: { checks: unknown[] } }).previews.checks).toHaveLength(3)
    await ask({ op: 'frontDoor.set', on: false })
    expect(await ask({ op: 'frontDoor.set', on: true, confirmPorts: true })).toMatchObject({ ok: true })
    expect(read('front-door', 'Caddyfile')).toContain(caddyBlock)
  })

  it('refuses a previews host the front door cannot take', async () => {
    const answer = await ask({ op: 'frontDoor.set', on: true, confirmPorts: true, previewsHost: 'acme.example' })
    expect(refusal(answer)).toMatchObject({ code: 'malformed', message: expect.stringContaining('directly under it') })
  })
})
