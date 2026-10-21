import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScheduledChangeNotice } from '@agenthix/core'
import { generateHostKeys } from '@agenthix/core/host-crypto'
import { loadOrCreateKeys } from '../state/keys'
import { FakeHost } from './fakes'
import { startHarness, type Harness } from './harness'

// A host service sends each scheduled-change notice sealed to the Fleet Console it pins, and offers every one it
// holds again whenever its figures are read. The Scheduled screen reads them from the fleet.

let h: Harness
let auth: { cookie: string; csrf: string }
let office: FakeHost

function notice(id: string, sentAt: string, update: ScheduledChangeNotice['update'] = 'scheduled'): ScheduledChangeNotice {
  return {
    update,
    sentAt,
    reason: null,
    change: {
      id, kind: 'resize', target: 'site', siteName: 'office-server',
      // What the machine wrote for itself; the Fleet Console knows the machine by the key it pinned.
      machine: { name: 'office-server', fingerprint: 'f'.repeat(64) },
      at: '2026-10-16T01:00:00.000Z', scheduledBy: { kind: 'machineAdmin' }, scheduledAt: '2026-10-15T08:00:00.000Z',
      state: update === 'cancelled' ? 'cancelled' : 'scheduled', detail: '6 GB', expectedMinutes: 1,
    },
  }
}

type FleetHost = { fingerprint: string; scheduled: ScheduledChangeNotice[] }
const scheduledOf = async () => ((await h.request('/api/fleet', auth)).json as { hosts: FleetHost[] }).hosts[0].scheduled

beforeEach(async () => {
  h = await startHarness({ commandTimeouts: { short: 500, long: 500 } })
  auth = await h.signIn()
  office = await FakeHost.create()
  await h.ctx.hosts.pin({
    fingerprint: office.fingerprint, hostId: 'h-office', identity: office.keys.identity, machineName: 'office-server',
    siteName: 'office-server', executionSiteId: 'es-office', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
  })
  office.consoleIdentity = (await loadOrCreateKeys(h.state)).identity
})
afterEach(async () => { await h.close() })

describe('scheduled-change notices from a machine @SC-885', () => {
  it('are shown on the fleet, under the fingerprint the machine was pinned with', async () => {
    await h.ctx.commands.receive(await office.seal({ kind: 'scheduledChange', notice: notice('1', '2026-10-15T08:00:00.000Z') }))
    const [kept] = await scheduledOf()
    expect(kept).toMatchObject({ update: 'scheduled', change: { id: '1', detail: '6 GB' } })
    expect(kept.change.machine.fingerprint).toBe(office.fingerprint)
  })

  it('keep a notice offered again once, and add a newer one of the same change', async () => {
    const first = notice('1', '2026-10-15T08:00:00.000Z')
    await h.ctx.commands.receive(await office.seal({ kind: 'scheduledChange', notice: first }))
    await h.ctx.commands.receive(await office.seal({ kind: 'scheduledChange', notice: first }))
    await h.ctx.commands.receive(await office.seal({ kind: 'scheduledChange', notice: notice('1', '2026-10-15T08:05:00.000Z', 'cancelled') }))
    expect((await scheduledOf()).map(n => n.update)).toEqual(['scheduled', 'cancelled'])
  })

  it('are dropped from a key that is not pinned', async () => {
    const impostor = await generateHostKeys('host')
    await h.ctx.commands.receive(await office.seal({ kind: 'scheduledChange', notice: notice('1', '2026-10-15T08:00:00.000Z') }, impostor))
    expect(await scheduledOf()).toEqual([])
  })
})
