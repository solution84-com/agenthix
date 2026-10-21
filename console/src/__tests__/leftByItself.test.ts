import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeJoinCode, type RelayedHost } from '@agenthix/core'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

// A machine that disconnected itself and told hq so (spec §6): the fleet shows it as left by itself, not as switched
// off, until a fleet admin removes it.

let h: Harness
let auth: { cookie: string; csrf: string }
let office: FakeHost
let fresh: FakeHost
let listed: RelayedHost[]

const LEFT_AT = '2026-10-14T21:41:00.000Z'

beforeEach(async () => {
  h = await startHarness()
  ;[office, fresh] = await Promise.all([FakeHost.create(), FakeHost.create()])
  listed = []
  h.link.handle('host.list', () => ({ hosts: listed }))
  h.link.handle('site.remove', () => ({ removed: false }))
  h.link.handle('host.disconnect', () => ({ disconnected: true }))
  auth = await h.signIn()
  for (const [host, hostId, name] of [[office, 'h-office', 'office-server'], [fresh, 'h-fresh', 'machine-b']] as const) {
    await h.ctx.hosts.pin({
      fingerprint: host.fingerprint, hostId, identity: host.keys.identity, machineName: name,
      siteName: name, executionSiteId: `es-${hostId}`, connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
    })
  }
})
afterEach(async () => { await h.close() })

const api = (path: string, method = 'GET', body?: unknown) => h.request(path, { method, body, ...auth })
const fleetHost = async (fingerprint: string) =>
  ((await api('/api/fleet')).json.hosts as { fingerprint: string; online: boolean; leftByItself: boolean; leftAt: string | null }[])
    .find(x => x.fingerprint === fingerprint)
const freshLeft = (leftAt?: string): RelayedHost =>
  ({ hostId: 'h-fresh', fingerprint: fresh.fingerprint, machineName: 'machine-b', online: false, since: LEFT_AT, ...(leftAt ? { leftAt } : {}) })

describe('a machine that left by itself, in the fleet @SC-879', () => {
  it('shows as left by itself, from hq’s list, and not merely as offline', async () => {
    expect(await fleetHost(fresh.fingerprint)).toMatchObject({ online: false, leftByItself: false, leftAt: null })
    listed = [freshLeft(LEFT_AT)]
    await h.ctx.presence.refresh(h.link)
    expect(await fleetHost(fresh.fingerprint)).toMatchObject({ online: false, leftByItself: true, leftAt: LEFT_AT })
  })

  it('stays so through presence frames, and stops when hq’s list no longer says it (it joined again)', async () => {
    listed = [freshLeft(LEFT_AT)]
    await h.ctx.presence.refresh(h.link)
    h.link.emit('presence', { hostId: 'h-fresh', fingerprint: fresh.fingerprint, online: false, since: LEFT_AT })
    expect((await fleetHost(fresh.fingerprint))?.leftByItself).toBe(true)
    listed = [freshLeft()]
    await h.ctx.presence.refresh(h.link)
    expect((await fleetHost(fresh.fingerprint))?.leftByItself).toBe(false)
  })

  it('is read again from hq while the link stays up', async () => {
    h.ctx.presence.attach(h.link, 10)
    listed = [freshLeft(LEFT_AT)]
    await until(() => h.ctx.presence.of(fresh.fingerprint).leftAt === LEFT_AT)
  })
})

describe('moving a site to a machine that left by itself @SC-879', () => {
  async function newMachineAsks(): Promise<void> {
    h.link.handle('join.open', () => ({ joinId: 'j-move' }))
    h.link.handle('join.accept', () => ({ hostId: 'h-fresh' }))
    const started = await api(`/api/hosts/${office.fingerprint}/move`, 'POST', {})
    expect(started.status).toBe(201)
    const code = normalizeJoinCode(started.json.code as string)!
    h.link.emit('joinRequest', await fresh.joinRequest('j-move', code, 'machine-b'))
    await until(() => h.ctx.joins.get('j-move')?.state === 'confirming')
  }

  it('says to remove it first, and goes ahead once it is removed, with the same code', async () => {
    listed = [freshLeft(LEFT_AT)]
    await h.ctx.presence.refresh(h.link)
    await newMachineAsks()
    const refused = await api('/api/joins/j-move/confirm', 'POST', {})
    expect(refused.status).toBe(409)
    expect(JSON.stringify(refused.json)).toContain('machine-b left the fleet by itself, and is still listed. Remove it from the fleet first, then confirm again.')

    expect((await api(`/api/hosts/${fresh.fingerprint}/disconnect`, 'POST', {})).status).toBe(200)
    expect((await api('/api/joins/j-move/confirm', 'POST', {})).status).toBe(200)
    expect(h.link.callsOf('join.accept')).toHaveLength(1)
  })
})
