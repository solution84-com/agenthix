import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostIdentity } from '@agenthix/core'
import { generateHostKeys } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { pinCloudController } from '../../link/cloudController'
import { cloudOperation } from '../dispatch'

// Cloud's operations that hq answers (pre-release spec B6, B7): passed to hq over its control socket on hq's machine,
// `not_installed` anywhere else, and a link never logged.

const ADDRESS = 'https://hq.acme.example'
const HASH = 'ab'.repeat(32)
const KEY = 'O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik'
const CLIENT = 'kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k'
const LINK = 'https://hq.acme.example/invite/a-secret-token-never-logged'

let m: FakeMachine
let logged: string[]

const hqCalls = () => m.calls.filter(c => c[0] === 'exec' && c.some(a => a.startsWith('cloud-'))).map(c => c.slice(c.indexOf('-') + 1))

beforeEach(async () => {
  m = fakeMachine()
  const keys = await generateHostKeys('cloud')
  await pinCloudController(m.ctx.state, { identity: keys.identity as HostIdentity & { role: 'cloud' }, machineId: 'machine-1', pinnedAt: new Date().toISOString() })
  logged = []
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')) })
  }
})
afterEach(() => {
  vi.restoreAllMocks()
  m.cleanup()
})

describe('on a machine without HQ @SC-1063', () => {
  it('answers not_installed and asks nothing of hq', async () => {
    for (const request of [
      { op: 'site.register', machineId: 'machine-2', siteName: 'cloud-site-2', credentialHash: HASH },
      { op: 'site.unregister', executionSiteId: 'es-1' },
      { op: 'account.firstLink', ref: 'ref-1' },
      { op: 'account.resetLink', username: 'avery' },
      { op: 'account.adminInvite' },
    ]) {
      expect(await cloudOperation(m.ctx, request)).toMatchObject({ ok: false, op: request.op, refusal: { code: 'not_installed' } })
    }
    expect(hqCalls()).toEqual([])
  })
})

describe('on the machine that runs HQ @SC-1063', () => {
  beforeEach(async () => {
    await install(m.ctx, ADDRESS, () => {})
    m.calls.length = 0
  })

  it('passes site.register and site.unregister to hq, the credential by its hash only', async () => {
    m.hq['cloud-site-register'] = { ok: true, text: 'Done.', data: { executionSiteId: 'es-1' } }
    m.hq['cloud-site-unregister'] = { ok: true, text: 'Done.', data: { removed: true } }
    expect(await cloudOperation(m.ctx, { op: 'site.register', machineId: 'machine-2', siteName: 'cloud-site-2', credentialHash: HASH.toUpperCase() }))
      .toEqual({ ok: true, op: 'site.register', result: { executionSiteId: 'es-1' } })
    expect(await cloudOperation(m.ctx, { op: 'site.unregister', executionSiteId: 'es-1' })).toEqual({ ok: true, op: 'site.unregister', result: { removed: true } })
    expect(hqCalls()).toEqual([['cloud-site-register', 'machine-2', 'cloud-site-2', HASH], ['cloud-site-unregister', 'es-1']])
  })

  it("passes hq's refusals on by their code", async () => {
    m.hq['cloud-site-register'] = { ok: false, error: 'A site named cloud-site-2 is already in HQ.', code: 'conflict' }
    m.hq['cloud-reset-link'] = { ok: false, error: 'No active organisation admin signs in with that username.', code: 'not_found' }
    m.hq['cloud-admin-invite'] = { ok: false, error: 'HQ still has an active organisation admin, who can invite another.', code: 'conflict' }
    expect(await cloudOperation(m.ctx, { op: 'site.register', machineId: 'machine-2', siteName: 'cloud-site-2', credentialHash: HASH }))
      .toMatchObject({ ok: false, refusal: { code: 'conflict', message: 'A site named cloud-site-2 is already in HQ.' } })
    expect(await cloudOperation(m.ctx, { op: 'account.resetLink', username: 'avery' })).toMatchObject({ ok: false, refusal: { code: 'not_found' } })
    expect(await cloudOperation(m.ctx, { op: 'account.adminInvite' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
  })

  it('answers the links hq makes, https only, and never logs one', async () => {
    m.hq['cloud-first-link'] = { ok: true, text: 'Done.', data: { link: LINK, expiresAt: '2026-10-19T10:00:00.000Z' } }
    m.hq['cloud-reset-link'] = { ok: true, text: 'Done.', data: { link: LINK, expiresAt: '2026-10-18T11:00:00.000Z' } }
    m.hq['cloud-admin-invite'] = { ok: true, text: 'Done.', data: { link: LINK, expiresAt: '2026-10-19T10:00:00.000Z' } }
    expect(await cloudOperation(m.ctx, { op: 'account.firstLink', ref: 'ref-1' })).toEqual({ ok: true, op: 'account.firstLink', result: { link: LINK, expiresAt: '2026-10-19T10:00:00.000Z' } })
    expect(await cloudOperation(m.ctx, { op: 'account.resetLink', username: 'avery' })).toMatchObject({ ok: true, result: { link: LINK } })
    expect(await cloudOperation(m.ctx, { op: 'account.adminInvite' })).toMatchObject({ ok: true, result: { link: LINK } })
    expect(hqCalls()).toEqual([['cloud-first-link', 'ref-1'], ['cloud-reset-link', 'avery'], ['cloud-admin-invite']])
    expect(logged.join('\n')).not.toContain('a-secret-token')

    m.hq['cloud-reset-link'] = { ok: true, text: 'Done.', data: { link: 'http://hq.acme.example/reset-password/x', expiresAt: '2026-10-18T11:00:00.000Z' } }
    expect(await cloudOperation(m.ctx, { op: 'account.resetLink', username: 'avery' })).toMatchObject({ ok: false, refusal: { code: 'failed' } })
  })

  it('answers who was made first once hq has accounts', async () => {
    const hasAccounts = { state: 'hasAccounts', accounts: 3, firstAdmin: { madeAt: '2026-10-01T09:00:00.000Z', madeWith: { kind: 'firstLink', ref: 'ref-1' } } }
    m.hq['cloud-first-link'] = { ok: true, text: 'Done.', data: hasAccounts }
    expect(await cloudOperation(m.ctx, { op: 'account.firstLink', ref: 'ref-2' })).toEqual({ ok: true, op: 'account.firstLink', result: hasAccounts })
  })

  it('refuses a request whose fields are not valid, asking nothing of hq', async () => {
    for (const request of [
      { op: 'site.register', machineId: 'machine-2', siteName: 'cloud-site-2', credentialHash: 'not-a-hash' },
      { op: 'site.register', machineId: 'machine 2', siteName: 'cloud-site-2', credentialHash: HASH },
      { op: 'site.register', machineId: 'machine-2', siteName: '', credentialHash: HASH },
      { op: 'site.unregister' },
      { op: 'account.firstLink', ref: 'has space' },
      { op: 'account.resetLink', username: 7 },
    ]) {
      expect(await cloudOperation(m.ctx, request)).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    }
    expect(hqCalls()).toEqual([])
  })

  it('passes connecting HQ to the organisation Cloud runs it for, checking each field both ways @SC-1124', async () => {
    m.hq['cloud-organisation-key'] = { ok: true, text: 'Done.', data: { publicKey: KEY, clientId: CLIENT, hqAddress: 'https://hq.acme.example' } }
    m.hq['cloud-organisation-connect'] = { ok: true, text: 'Done.', data: { cloudOrganisationId: 'org_42', name: 'Acme Robotics', connectedAt: '2026-10-19T10:00:00.000Z' } }
    expect(await cloudOperation(m.ctx, { op: 'organisation.key' })).toEqual({ ok: true, op: 'organisation.key', result: { publicKey: KEY, clientId: CLIENT, hqAddress: 'https://hq.acme.example' } })
    expect(await cloudOperation(m.ctx, { op: 'organisation.connect', cloudOrganisationId: 'org_42', name: 'Acme Robotics' }))
      .toEqual({ ok: true, op: 'organisation.connect', result: { cloudOrganisationId: 'org_42', name: 'Acme Robotics', connectedAt: '2026-10-19T10:00:00.000Z' } })
    expect(hqCalls()).toEqual([['cloud-organisation-key'], ['cloud-organisation-connect', 'org_42', 'Acme Robotics']])
    for (const request of [
      { op: 'organisation.connect', cloudOrganisationId: 'org 42', name: 'Acme' },
      { op: 'organisation.connect', cloudOrganisationId: 'org.42', name: 'Acme' },
      { op: 'organisation.connect', cloudOrganisationId: 'org:42', name: 'Acme' },
      { op: 'organisation.connect', cloudOrganisationId: 'org_42', name: '' },
      { op: 'organisation.connect', name: 'Acme' },
    ]) expect(await cloudOperation(m.ctx, request)).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    m.hq['cloud-organisation-connect'] = { ok: false, error: 'HQ is connected to another Agenthix Cloud organisation.', code: 'conflict' }
    expect(await cloudOperation(m.ctx, { op: 'organisation.connect', cloudOrganisationId: 'org_7', name: 'Other' })).toMatchObject({ ok: false, refusal: { code: 'conflict' } })
    for (const data of [{ publicKey: 7 }, { publicKey: KEY, clientId: CLIENT }, { publicKey: KEY, clientId: CLIENT, hqAddress: 'https://hq.acme.example/?x' }]) {
      m.hq['cloud-organisation-key'] = { ok: true, text: 'Done.', data }
      expect(await cloudOperation(m.ctx, { op: 'organisation.key' })).toMatchObject({ ok: false, refusal: { code: 'failed' } })
    }
  })

  it('says HQ is not answering when it is not running', async () => {
    m.hq['cloud-admin-invite'] = null
    expect(await cloudOperation(m.ctx, { op: 'account.adminInvite' })).toMatchObject({ ok: false, refusal: { code: 'busy' } })
  })

  it("erases HQ for Cloud only when the request names HQ's address", async () => {
    expect(await cloudOperation(m.ctx, { op: 'erase', target: 'hq', confirmAddress: 'https://other.example' }))
      .toMatchObject({ ok: false, refusal: { code: 'conflict', message: expect.stringContaining("not HQ's address") } })
    expect(await cloudOperation(m.ctx, { op: 'erase', target: 'hq' })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    expect(m.calls.filter(c => c[0] === 'compose' && c.includes('down'))).toEqual([])
  })
})
