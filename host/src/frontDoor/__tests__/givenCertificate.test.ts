import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HostIdentity } from '@agenthix/core'
import { generateHostKeys } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { cloudOperation } from '../../cloud/dispatch'
import { install } from '../../install/install'
import { moveHqAddress } from '../../install/hqAddress'
import { pinCloudController } from '../../link/cloudController'
import { ownerHandler } from '../../owner/dispatch'
import { frontDoorFigures } from '../frontDoor'
import type { CertificateCheck } from '../probes'
import { madeCertificate } from './madeCertificate'
import { withFeature } from '@agenthix/core/testing'

const NAMES = ['hq.acme.example', 'files.acme.example', 'files.hq.acme.example']
let m: FakeMachine
let certs: Map<string, CertificateCheck>
let given: { certificate: string; privateKey: string }

beforeEach(async () => {
  m = fakeMachine()
  // A certificate made now is valid from now, so the machine's clock is the real one, moved by what tests wait.
  let skew = 0
  m.ctx.now = () => new Date(Date.now() + skew)
  m.ctx.sleep = async ms => { skew += ms }
  certs = new Map([['hq.acme.example', { ok: true, expiresAt: '2027-01-10T00:00:00.000Z' }], ['files.acme.example', { ok: true, expiresAt: '2027-01-10T00:00:00.000Z' }]])
  m.ctx.frontDoorProbes = {
    certificate: async host => certs.get(host) ?? { ok: false, problem: 'connect ECONNREFUSED 127.0.0.1:443' },
  }
  const keys = await generateHostKeys('cloud')
  await pinCloudController(m.ctx.state, { identity: keys.identity as HostIdentity & { role: 'cloud' }, machineId: 'machine-1', pinnedAt: m.ctx.now().toISOString() })
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.calls.length = 0
  given = madeCertificate(NAMES)
})
afterEach(() => m.cleanup())

const cloud = (r: Record<string, unknown>) => cloudOperation(m.ctx, { op: 'frontDoor.set', on: true, confirmPorts: true, ...r }) as Promise<Record<string, any>>
const read = (...parts: string[]) => fs.readFileSync(m.ctx.state.path(...parts), 'utf8')
/** HQ's address is changed with the front door off (frontDoor.ts's rule); what Cloud gave stays recorded. */
async function moved() {
  await cloudOperation(m.ctx, { op: 'frontDoor.set', on: false })
  const address = 'https://hq.other.example'
  m.hq['address-move'] = { ok: true, text: 'told', data: { sites: { told: 0, online: 0, of: 0 }, hosts: { told: 0, of: 0 }, console: false } }
  m.hq.status = { ok: true, text: 'HQ', data: { users: 1, hqSite: { state: 'connected', dockerRunning: true }, address, version: 'dev', commit: 'c' } }
  await moveHqAddress(m.ctx, address, () => {})
}
const hqSettings = () => JSON.parse(read('hq', 'settings.json'))

withFeature('cloud', () => {
  describe('a front door given a certificate by Agenthix Cloud @SC-1060', () => {
    it('serves it, never asks a certificate authority, and keeps the key at 0600', async () => {
      expect(await cloud({ ...given, filesHost: 'files.acme.example' })).toMatchObject({ ok: true, result: { on: true } })
      const caddy = read('front-door', 'Caddyfile')
      expect(caddy).toContain('auto_https disable_certs')
      expect(caddy).toContain('tls /etc/caddy/tls/certificate.pem /etc/caddy/tls/private-key.pem')
      expect(caddy).toContain('hq.acme.example, files.acme.example {')
      expect(fs.statSync(m.ctx.state.path('front-door', 'tls', 'private-key.pem')).mode & 0o777).toBe(0o600)
      expect(read('front-door', 'tls', 'certificate.pem')).toBe(given.certificate)
      const door = JSON.parse(read('front-door', 'compose.json')).services['front-door']
      expect(door.volumes).toContain('/home/sam/.agenthix/front-door/tls:/etc/caddy/tls:ro')
      expect(hqSettings().filesOrigin).toBe('https://files.acme.example')
    })

    it('checks the Caddyfile Caddy can check, which holds no line naming a file hq-web does not have', async () => {
      await cloud({ ...given, filesHost: 'files.acme.example' })
      const validated = m.calls.find(c => c[0] === 'exec')!
      expect(validated).toContain('validate')
      expect(validated).toBeDefined()
    })

    it('is refused from anyone but Cloud, the key never reaching the files or an answer', async () => {
      const answer = await ownerHandler(m.ctx)({ op: 'frontDoor.set', on: true, confirmPorts: true, ...given }, () => {}) as Record<string, any>
      expect(answer).toMatchObject({ ok: false })
      expect(JSON.stringify(answer)).not.toContain('PRIVATE KEY')
      expect(fs.existsSync(m.ctx.state.path('front-door'))).toBe(false)
      expect(m.calls).toEqual([])
    })

    it.each([
      ['a certificate without its key', { certificate: 'x' }],
      ['a key that is not one', { certificate: '-----BEGIN CERTIFICATE-----', privateKey: 'not a key' }],
    ])('refuses %s', async (_name, over) => {
      expect(await cloud(over)).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
      expect(m.calls).toEqual([])
    })

    it('refuses a key that belongs to another certificate, an expired one, and one that does not cover the host', async () => {
      const other = madeCertificate(NAMES)
      const mismatch = await cloud({ certificate: given.certificate, privateKey: other.privateKey, filesHost: 'files.acme.example' })
      expect(mismatch).toMatchObject({ ok: false, refusal: { message: 'The private key does not belong to the certificate. Nothing changed.' } })
      const elsewhere = madeCertificate(['other.example'])
      expect(await cloud({ ...elsewhere, filesHost: 'files.acme.example' })).toMatchObject({ ok: false, refusal: { message: 'The certificate does not cover hq.acme.example. Nothing changed.' } })
      await m.ctx.sleep(200 * 365 * 24 * 3600_000)
      expect(await cloud({ ...given, filesHost: 'files.acme.example' })).toMatchObject({ ok: false, refusal: { message: 'The certificate has expired. Nothing changed.' } })
      expect(m.calls.filter(c => c[0] === 'compose')).toEqual([])
      expect(fs.existsSync(m.ctx.state.path('front-door', 'tls'))).toBe(false)
    })

    it('does not echo the key in a refusal when the host does not answer, and rolls the files back', async () => {
      certs.delete('files.acme.example')
      const answer = await cloud({ ...given, filesHost: 'files.acme.example' })
      expect(answer).toMatchObject({ ok: false, refusal: { code: 'failed' } })
      expect(JSON.stringify(answer)).not.toContain('PRIVATE KEY')
      expect(fs.existsSync(m.ctx.state.path('front-door', 'tls', 'private-key.pem'))).toBe(false)
    })

    it('replaces the certificate at renewal and starts the front door again with it', async () => {
      await cloud({ ...given, filesHost: 'files.acme.example' })
      const before = JSON.parse(read('front-door', 'compose.json')).services['front-door'].labels
      const renewed = madeCertificate(NAMES)
      expect(await cloud({ ...renewed, filesHost: 'files.acme.example' })).toMatchObject({ ok: true })
      expect(read('front-door', 'tls', 'certificate.pem')).toBe(renewed.certificate)
      expect(JSON.parse(read('front-door', 'compose.json')).services['front-door'].labels).not.toEqual(before)
    })

    it('with no files host given, serves uploads as downloads only, and keeps it so through a new address', async () => {
      expect(await cloud({ ...given })).toMatchObject({ ok: true })
      expect(hqSettings().filesOrigin).toBeNull()
      expect(read('front-door', 'Caddyfile')).toContain('\nhq.acme.example {')
      await moved()
      expect(hqSettings().filesOrigin).toBeNull()
    })

    it('keeps a given files host through a new address', async () => {
      await cloud({ ...given, filesHost: 'files.acme.example' })
      await moved()
      expect(hqSettings().address).toBe('https://hq.other.example')
      expect(hqSettings().filesOrigin).toBe('https://files.acme.example')
    })

    it('turns on with a certificate no browser trusts, checked as the one it was given, and reports no renewal problem', async () => {
      // As the machine's probe does: a browser's check fails what only the proxy in front trusts; the given one is matched.
      const asked: (string | undefined)[] = []
      m.ctx.frontDoorProbes = {
          certificate: async (_host, expected) => {
          asked.push(expected)
          return expected === given.certificate ? { ok: true, expiresAt: '2027-01-10T00:00:00.000Z' } : { ok: false, problem: 'unable to get local issuer certificate' }
        },
      }
      expect(await cloud({ ...given, filesHost: 'files.acme.example' })).toMatchObject({ ok: true, result: { on: true } })
      expect(await frontDoorFigures(m.ctx)).toEqual({ on: true, certificateExpiresAt: '2027-01-10T00:00:00.000Z', renewalProblem: null })
      expect(asked.every(e => e === given.certificate)).toBe(true)
    })

    it('leaves previews off', async () => {
      expect(await cloud({ ...given, filesHost: 'files.acme.example', previewsHost: 'p.acme.example' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    })
  })
})
