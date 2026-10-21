import { describe, expect, it } from 'vitest'
import type { ScheduledChange } from '@agenthix/core'
import { overviewOf, pendingChanges } from '../pages/dashboard/overview'
import type { FleetHost } from '../pages/dashboard/types'

const NOW = new Date(2026, 9, 15, 12, 0)
const change = (over: Partial<ScheduledChange>): ScheduledChange => ({
  id: 'c1', kind: 'upgrade', target: 'site', siteName: 'office-server', machine: { name: 'office-server', fingerprint: 'f' },
  at: new Date(2026, 9, 18, 2, 0).toISOString(), scheduledBy: { kind: 'maintenanceWindow' }, scheduledAt: NOW.toISOString(),
  state: 'scheduled', detail: '0.2.1', expectedMinutes: 10, ...over,
})
const host = (over: Partial<FleetHost>): FleetHost => ({
  fingerprint: 'f', fingerprintShort: 'f', hostId: 'h', machineName: 'm', siteName: 'm', hqMachine: false, siteRegistered: true,
  connectedAt: NOW.toISOString(), online: false, since: null, leftByItself: false, leftAt: null, figures: null, figuresAt: null,
  agents: null, scheduled: [], move: null, ...over,
})

describe('pending scheduled changes @SC-896', () => {
  it("keeps each change's newest notice and drops those finished or cancelled", () => {
    const h = host({
      scheduled: [
        { update: 'scheduled', change: change({ id: 'a' }), sentAt: '2026-10-14T00:00:00Z', reason: null },
        { update: 'cancelled', change: change({ id: 'a', state: 'cancelled' }), sentAt: '2026-10-14T01:00:00Z', reason: null },
        { update: 'scheduled', change: change({ id: 'b' }), sentAt: '2026-10-14T00:00:00Z', reason: null },
      ],
    })
    expect(pendingChanges(h).map(c => c.id)).toEqual(['b'])
  })
})

describe('the overview @SC-896', () => {
  it('counts sites by state and lists those that need attention', () => {
    const hourAgo = new Date(NOW.getTime() - 60 * 60_000).toISOString()
    const quiet = host({ siteName: 'laptop', since: hourAgo, notifyIfSilent: false })
    const silent = host({ siteName: 'office', since: hourAgo })
    const stopped = host({ siteName: 'lab', since: hourAgo, stoppedAt: hourAgo })
    const left = host({ siteName: 'old-box', leftByItself: true, leftAt: NOW.toISOString() })
    const o = overviewOf([quiet, silent, stopped, left], NOW)
    expect(o.sites).toEqual({ total: 4, breakdown: '2 need attention · 1 stopped · 1 not heard from' })
    expect(o.attention.reasons).toEqual([{ siteName: 'office', reason: 'not answering' }, { siteName: 'old-box', reason: 'disconnected itself' }])
  })

  it('names the next scheduled change and the sites it is on', () => {
    const n = (name: string) => host({ siteName: name, scheduled: [{ update: 'scheduled', change: change({ id: name, siteName: name }), sentAt: '2026-10-14T00:00:00Z', reason: null }] })
    const o = overviewOf([n('hq-box'), n('office-server')], NOW)
    expect(o.next).toEqual({ when: '18 Oct 02:00', what: 'Upgrade 0.2.1', sites: ['hq-box', 'office-server'] })
  })

  it('has no next change, no backup and no capacity for an empty fleet', () => {
    expect(overviewOf([], NOW)).toMatchObject({ sites: { total: 0, breakdown: '' }, next: null, backup: null, agents: { running: 0, capacity: 0, sites: 0 } })
  })
})
