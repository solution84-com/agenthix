import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HqRelay, SiteLoad } from '@agenthix/core'
import { FakeHost } from './fakes'
import { SAM, startHarness, type Harness } from './harness'

// What the screens show of hq, asked over the link (spec §7): the organisation's name, HQ's address, each site's runs,
// and when the signed-in person was given the role. Each parsed field by field; left out when hq does not say.

let h: Harness
let auth: { cookie: string; csrf: string }

const ABOUT = { organisationName: 'Acme Robotics', address: 'https://hq.acme.example' }
const at = '2026-10-15T08:00:00.000Z'
const LOADS: SiteLoad[] = [
  { executionSiteId: 'es-default', isDefault: true, running: 2, maxAtOnce: 4, reportedAt: at },
  { executionSiteId: 'es-office', isDefault: false, running: 1, maxAtOnce: 6, reportedAt: at },
  { executionSiteId: 'es-elsewhere', isDefault: false, running: 3, maxAtOnce: 3, reportedAt: at },
]

type FleetJson = { hq: unknown; hosts: { machineName: string; agents: unknown }[] }
const fleet = async () => (await h.request('/api/fleet', auth)).json as FleetJson
const agentsOf = (f: FleetJson, machine: string) => f.hosts.find(x => x.machineName === machine)?.agents

async function pin(machineName: string, executionSiteId: string | null, hqMachine = false) {
  const fake = await FakeHost.create()
  await h.ctx.hosts.pin({
    fingerprint: fake.fingerprint, hostId: `h-${machineName}`, identity: fake.keys.identity, machineName, siteName: machineName,
    executionSiteId, connectedAt: at, connectedBy: null, ...(hqMachine ? { hqMachine: true } : {}),
  })
}

beforeEach(async () => {
  h = await startHarness()
  auth = await h.signIn()
  await pin('hq-box', null, true)
  await pin('office-server', 'es-office')
})
afterEach(async () => { await h.close() })

describe('HQ on the fleet @SC-888', () => {
  it('is named as hq names it, with the address people open it at', async () => {
    h.link.handle('hq.about', () => ABOUT)
    expect((await fleet()).hq).toEqual(ABOUT)
  })

  it('goes without what hq does not give in its shape', async () => {
    h.link.handle('hq.about', () => ({ organisationName: 'Acme Robotics', address: 'javascript:alert(1)' }))
    expect((await fleet()).hq).toEqual({ organisationName: 'Acme Robotics', address: null })
  })

  it('is left out by an hq older than the method, and by an hq that does not answer', async () => {
    expect((await fleet()).hq).toBeNull()
    h.link.state = 'disconnected'
    expect((await fleet()).hq).toBeNull()
  })

  it('keeps the last answer while hq is away, and asks hq at most every few minutes', async () => {
    h.link.handle('hq.about', () => ABOUT)
    await fleet()
    await fleet()
    expect(h.link.callsOf('hq.about')).toHaveLength(1)
    h.link.state = 'disconnected'
    expect((await fleet()).hq).toEqual(ABOUT)
  })
})

describe('agents running, per site @SC-888', () => {
  it('are each site’s runs as hq last heard them: the default site on HQ’s machine, the others by their id', async () => {
    h.link.handle('site.loads', () => ({ sites: LOADS }))
    const f = await fleet()
    expect(agentsOf(f, 'hq-box')).toEqual({ running: 2, maxAtOnce: 4, reportedAt: at })
    expect(agentsOf(f, 'office-server')).toEqual({ running: 1, maxAtOnce: 6, reportedAt: at })
  })

  it('are not known for a site hq has no report of, or while hq does not answer', async () => {
    h.link.handle('site.loads', () => ({ sites: [LOADS[2]] }))
    expect(agentsOf(await fleet(), 'office-server')).toBeNull()
    h.link.state = 'disconnected'
    expect(agentsOf(await fleet(), 'hq-box')).toBeNull()
  })

  it('are not known from an hq older than the method, and the fleet is still shown', async () => {
    const res = await h.request('/api/fleet', auth)
    expect(res.status).toBe(200)
    expect(agentsOf(res.json as FleetJson, 'hq-box')).toBeNull()
  })

  it('drop an entry not in its shape', async () => {
    h.link.handle('site.loads', () => ({ sites: [{ ...LOADS[1], running: -4 }] }) as never)
    expect(agentsOf(await fleet(), 'office-server')).toBeNull()
  })
})

describe('hq’s own relay on the fleet @SC-1591', () => {
  const RELAY: HqRelay = { name: 'hq-box', filesAddress: 'https://files.acme.example', answering: true, lastSeenAt: at, sites: 2, openStreams: 1, bytesCarried: 5_000_000 }
  const relayOf = async () => ((await h.request('/api/fleet', auth)).json as { hqRelay: unknown }).hqRelay

  it('is hq’s relay as hq gives it', async () => {
    h.link.handle('relay.facts', () => ({ relay: RELAY }))
    expect(await relayOf()).toEqual(RELAY)
  })

  it('drops an address that is not a web address', async () => {
    h.link.handle('relay.facts', () => ({ relay: { ...RELAY, filesAddress: 'javascript:alert(1)' } }) as never)
    expect(await relayOf()).toEqual({ ...RELAY, filesAddress: null })
  })

  it('is null for a relay not in its shape', async () => {
    h.link.handle('relay.facts', () => ({ relay: { name: 'x', answering: 'yes' } }) as never)
    expect(await relayOf()).toBeNull()
  })

  it('is null from an hq older than the method, and while hq does not answer', async () => {
    expect(await relayOf()).toBeNull()
    h.link.handle('relay.facts', () => ({ relay: RELAY }))
    h.link.state = 'disconnected'
    expect(await relayOf()).toBeNull()
  })
})

describe('the signed-in person, from hq @SC-888', () => {
  it('has their username and when they were given the role', async () => {
    h.link.handle('fleetAdmin.list', () => ({ admins: [{ id: SAM.id, name: SAM.name, username: 'sam', organisationAdmin: true, since: '2026-10-12T09:00:00.000Z' }] }))
    h.ctx.roles.forget()
    h.link.handle('hq.about', () => ABOUT)
    const res = await h.request('/api/session', auth)
    expect(res.json).toEqual({
      user: { id: SAM.id, name: SAM.name },
      account: { username: 'sam', organisationAdmin: true, since: '2026-10-12T09:00:00.000Z' },
      hq: ABOUT,
    })
  })

  it('does without the date from an older hq, and without the account while hq does not answer', async () => {
    expect((await h.request('/api/session', auth)).json.account).toEqual({ username: 'sam', organisationAdmin: true, since: null })
    h.ctx.roles.forget()
    h.link.state = 'disconnected'
    const res = await h.request('/api/session', auth)
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ user: { id: SAM.id }, account: null, hq: null })
  })

  it('is never another person’s account', async () => {
    h.link.handle('fleetAdmin.list', () => ({ admins: [{ id: 'u-avery', name: 'Avery', username: 'avery', organisationAdmin: false, since: at }, { id: SAM.id, name: SAM.name, username: 'sam', organisationAdmin: false, since: at }] }))
    h.ctx.roles.forget()
    expect((await h.request('/api/session', auth)).json.account).toEqual({ username: 'sam', organisationAdmin: false, since: at })
  })
})
