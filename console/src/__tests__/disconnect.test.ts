import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RelayedHost } from '@agenthix/core'
import { FakeHost } from './fakes'
import { startHarness, SAM, type Harness } from './harness'

// Disconnect in the Fleet Console (spec §6, §10): never HQ's own machine, and a machine disconnected here stays listed,
// with who did it and when, until a fleet admin removes it from the list.

let h: Harness
let auth: { cookie: string; csrf: string }
let office: FakeHost
let hqBox: FakeHost
let listed: RelayedHost[]

beforeEach(async () => {
  h = await startHarness()
  ;[office, hqBox] = await Promise.all([FakeHost.create(), FakeHost.create()])
  listed = []
  h.link.handle('host.list', () => ({ hosts: listed }))
  h.link.handle('site.remove', () => ({ removed: true }))
  h.link.handle('host.disconnect', () => ({ disconnected: true }))
  auth = await h.signIn()
  await h.ctx.hosts.pin({
    fingerprint: office.fingerprint, hostId: 'h-office', identity: office.keys.identity, machineName: 'office-server',
    siteName: 'office', executionSiteId: 'es-office', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
  })
  await h.ctx.hosts.pin({
    fingerprint: hqBox.fingerprint, hostId: 'h-hq', identity: hqBox.keys.identity, machineName: 'hq-box',
    siteName: 'hq-box', executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: null, hqMachine: true,
  })
})
afterEach(async () => { await h.close() })

const api = (path: string, method = 'GET', body?: unknown) => h.request(path, { method, body, ...auth })
type Disconnected = { id: string; fingerprint: string; machineName: string; siteName: string; by: { userId: string; name: string }; at: string }
const disconnectedList = async () => (await api('/api/fleet')).json.disconnected as Disconnected[]

describe("HQ's own machine @SC-878", () => {
  it('is refused, with what to do instead, and nothing changes in HQ or here', async () => {
    const res = await api(`/api/hosts/${hqBox.fingerprint}/disconnect`, 'POST', {})
    expect(res.status).toBe(409)
    expect(res.json).toEqual({
      error: 'conflict',
      message: "hq-box carries HQ, so it cannot be disconnected. To retire this machine, move HQ first, with Move HQ… on HQ's page.",
    })
    expect(h.link.callsOf('host.disconnect')).toEqual([])
    expect(h.link.callsOf('site.remove')).toEqual([])
    expect(h.ctx.hosts.byFingerprint(hqBox.fingerprint)).not.toBeNull()
    expect(await disconnectedList()).toEqual([])
  })
})

describe('a machine disconnected here @SC-878', () => {
  it('stays listed with who disconnected it and when, and keeps no key', async () => {
    expect((await api(`/api/hosts/${office.fingerprint}/disconnect`, 'POST', {})).status).toBe(200)
    const fleet = (await api('/api/fleet')).json
    expect((fleet.hosts as { fingerprint: string }[]).map(x => x.fingerprint)).toEqual([hqBox.fingerprint])
    expect(fleet.disconnected).toEqual([{
      id: expect.any(String), fingerprint: office.fingerprint, machineName: 'office-server', siteName: 'office',
      by: { userId: SAM.id, name: SAM.name }, at: expect.any(String),
    }])
    const stored = JSON.stringify(h.state.readJson('disconnected.json'))
    expect(stored).toContain('office-server')
    expect(stored).not.toContain(office.keys.identity.signingKey)
    expect(stored).not.toContain(office.keys.identity.sealingKey)
  })

  it('goes from the list when a fleet admin removes it, and only once', async () => {
    await api(`/api/hosts/${office.fingerprint}/disconnect`, 'POST', {})
    const [record] = await disconnectedList()
    expect((await api(`/api/fleet/disconnected/${record.id}`, 'DELETE')).status).toBe(204)
    expect(await disconnectedList()).toEqual([])
    expect((await api(`/api/fleet/disconnected/${record.id}`, 'DELETE')).status).toBe(404)
  })

  it('is no longer listed as disconnected once the same machine is added again', async () => {
    await api(`/api/hosts/${office.fingerprint}/disconnect`, 'POST', {})
    await h.ctx.hosts.pin({
      fingerprint: office.fingerprint, hostId: 'h-office-2', identity: office.keys.identity, machineName: 'office-server',
      siteName: 'office', executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
    })
    expect(await disconnectedList()).toEqual([])
  })

  it('is not recorded when it had left by itself: removing it from the list is the end of it', async () => {
    listed = [{ hostId: 'h-office', fingerprint: office.fingerprint, machineName: 'office-server', online: false, since: '2026-10-14T21:41:00.000Z', leftAt: '2026-10-14T21:41:00.000Z' }]
    await h.ctx.presence.refresh(h.link)
    expect((await api(`/api/hosts/${office.fingerprint}/disconnect`, 'POST', {})).status).toBe(200)
    expect(await disconnectedList()).toEqual([])
  })
})
