import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeJoinCode, type RelayedHost } from '@agenthix/core'
import { HqCallError } from '../hq/link'
import { Silence } from '../hosts/silence'
import { loadOrCreateKeys } from '../state/keys'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

// "Notify the fleet admins if this machine stops answering": one setting per machine, asked when it joins, changed on
// its page, never asked of hq's machine. A machine that stops on purpose says so, and reads as stopped. hq raises the
// one notice; the Fleet Console tells it the two facts.

let h: Harness
let auth: { cookie: string; csrf: string }
let office: FakeHost
let hqBox: FakeHost
let fresh: FakeHost
let listed: RelayedHost[]

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

beforeEach(async () => {
  h = await startHarness()
  ;[office, hqBox, fresh] = await Promise.all([FakeHost.create(), FakeHost.create(), FakeHost.create()])
  const fleetConsole = (await loadOrCreateKeys(h.state)).identity
  for (const host of [office, hqBox, fresh]) host.consoleIdentity = fleetConsole
  listed = []
  h.link.handle('host.list', () => ({ hosts: listed }))
  h.link.handle('host.silenceFacts', () => ({ kept: true }))
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
const fleetHost = async (fp: string) =>
  ((await api('/api/fleet')).json.hosts as { fingerprint: string; notifyIfSilent: boolean; stoppedAt: string | null }[]).find(x => x.fingerprint === fp)!
const say = async (rows: RelayedHost[]) => {
  listed = rows
  await h.ctx.presence.refresh(h.link)
}
const officeIs = (online: boolean, since: string): RelayedHost =>
  ({ hostId: 'h-office', fingerprint: office.fingerprint, machineName: 'office-server', online, since })
const told = (action: string) => h.link.callsOf('activity.record').filter(c => c.action === action)

describe('the setting @SC-881', () => {
  it('is ticked by default, and always for hq’s machine', async () => {
    expect(await fleetHost(office.fingerprint)).toMatchObject({ notifyIfSilent: true, stoppedAt: null })
    expect(await fleetHost(hqBox.fingerprint)).toMatchObject({ notifyIfSilent: true })
  })

  it('changes on the machine’s page, kept and recorded, once per change', async () => {
    const off = await api(`/api/hosts/${office.fingerprint}/notify`, 'PUT', { notify: false })
    expect(off.status).toBe(200)
    expect(off.json.host).toMatchObject({ notifyIfSilent: false })
    expect(h.ctx.hosts.byFingerprint(office.fingerprint)?.notifyIfSilent).toBe(false)
    expect(told('machine.notifySet')).toEqual([expect.objectContaining({
      byUserId: 'u-sam', subject: 'office-server: do not notify the fleet admins if it stops answering', announce: false,
    })])
    await api(`/api/hosts/${office.fingerprint}/notify`, 'PUT', { notify: false })
    expect(told('machine.notifySet')).toHaveLength(1)
    expect((await api(`/api/hosts/${office.fingerprint}/notify`, 'PUT', { notify: true })).json.host).toMatchObject({ notifyIfSilent: true })
  })

  it('is not asked of hq’s machine, takes only true or false, and only through the guards', async () => {
    expect((await api(`/api/hosts/${hqBox.fingerprint}/notify`, 'PUT', { notify: false })).status).toBe(409)
    expect(h.ctx.hosts.byFingerprint(hqBox.fingerprint)?.notifyIfSilent).toBeUndefined()
    expect((await api(`/api/hosts/${office.fingerprint}/notify`, 'PUT', { notify: 'no' })).status).toBe(400)
    expect((await api(`/api/hosts/${'0'.repeat(64)}/notify`, 'PUT', { notify: false })).status).toBe(404)
    const noToken = await h.request(`/api/hosts/${office.fingerprint}/notify`, { method: 'PUT', body: { notify: false }, cookie: auth.cookie })
    expect(noToken.status).toBeGreaterThanOrEqual(400)
    expect(h.ctx.hosts.byFingerprint(office.fingerprint)?.notifyIfSilent).not.toBe(false)
  })

  it('is asked with the code: a site added unticked is pinned unticked', async () => {
    h.link.handle('join.open', () => ({ joinId: 'j-add' }))
    h.link.handle('join.accept', () => ({ hostId: 'h-fresh' }))
    expect((await api('/api/joins', 'POST', { notify: 'yes' })).status).toBe(400)
    const code = normalizeJoinCode((await api('/api/joins', 'POST', { notify: false })).json.code as string)!
    h.link.emit('joinRequest', await fresh.joinRequest('j-add', code, 'laptop'))
    await until(() => h.ctx.joins.get('j-add')?.state === 'confirming')
    expect((await api('/api/joins/j-add/confirm', 'POST', {})).status).toBe(200)
    expect(h.ctx.hosts.byFingerprint(fresh.fingerprint)).toMatchObject({ siteName: 'laptop', notifyIfSilent: false })
  })

  it('is asked with a move’s code: the new machine is pinned as asked', async () => {
    h.link.handle('join.open', () => ({ joinId: 'j-move' }))
    h.link.handle('join.accept', () => ({ hostId: 'h-fresh' }))
    expect((await api(`/api/hosts/${office.fingerprint}/move`, 'POST', { notify: 1 })).status).toBe(400)
    const started = await api(`/api/hosts/${office.fingerprint}/move`, 'POST', { notify: false })
    expect(started.status).toBe(201)
    h.link.emit('joinRequest', await fresh.joinRequest('j-move', normalizeJoinCode(started.json.code as string)!, 'new-server'))
    await until(() => h.ctx.joins.get('j-move')?.state === 'confirming')
    expect((await api('/api/joins/j-move/confirm', 'POST', {})).status).toBe(200)
    expect(h.ctx.hosts.byFingerprint(fresh.fingerprint)?.notifyIfSilent).toBe(false)
  })
})

describe('what hq is told for its notice @SC-881', () => {
  const facts = () => h.link.callsOf('host.silenceFacts')

  it('each machine’s setting and stop, when the link comes up; HQ’s machine always notify; nothing announced', async () => {
    h.link.setState('connected')
    await until(() => facts().length === 2)
    expect(facts()).toEqual(expect.arrayContaining([
      { hostId: 'h-office', notifyIfSilent: true, stoppedAt: null },
      { hostId: 'h-hq', notifyIfSilent: true, stoppedAt: null },
    ]))
    // Told once; asked again only when something changed.
    await h.ctx.silence.sync()
    expect(facts()).toHaveLength(2)
    expect(h.link.callsOf('activity.record').filter(c => c.announce)).toHaveLength(0)
  })

  it('a changed setting is told at once', async () => {
    await h.ctx.silence.sync()
    await api(`/api/hosts/${office.fingerprint}/notify`, 'PUT', { notify: false })
    await until(() => facts().some(f => f.hostId === 'h-office' && !f.notifyIfSilent))
  })

  it('told again after the link comes back, and not while it is down', async () => {
    await h.ctx.silence.sync()
    h.link.setState('disconnected')
    h.ctx.hosts.update(office.fingerprint, { notifyIfSilent: false })
    await h.ctx.silence.sync()
    expect(facts()).toHaveLength(2)
    h.link.setState('connected')
    await until(() => facts().length === 4)
  })

  it('an hq that does not know the method is left alone', async () => {
    let asked = 0
    h.link.handle('host.silenceFacts', () => { asked++; throw new HqCallError('unknown_method', 'no') })
    await h.ctx.silence.sync()
    h.ctx.hosts.update(office.fingerprint, { notifyIfSilent: false })
    await h.ctx.silence.sync()
    expect(asked).toBe(1)
  })
})

describe('the stop word @SC-882', () => {
  it('reads as stopped, tells no one, and ends when the machine answers again', async () => {
    const up = minutesAgo(30)
    await say([officeIs(true, up)])
    await h.ctx.commands.receive(await office.seal({ kind: 'stopping' }))
    const stoppedAt = (await fleetHost(office.fingerprint)).stoppedAt
    expect(stoppedAt).not.toBeNull()
    // hq's list still says online until it hears the link close: that is not answering again.
    await say([officeIs(true, up)])
    await say([officeIs(false, minutesAgo(20))])
    expect((await fleetHost(office.fingerprint)).stoppedAt).toBe(stoppedAt)
    await until(() => h.link.callsOf('host.silenceFacts').some(f => f.hostId === 'h-office' && f.stoppedAt === stoppedAt))
    // Kept across a restart of the Fleet Console.
    expect(new Silence({ hosts: h.ctx.hosts, presence: h.ctx.presence, link: h.link, state: h.state }).stoppedAt(office.fingerprint)).toBe(stoppedAt)

    await say([officeIs(true, new Date().toISOString())])
    expect((await fleetHost(office.fingerprint)).stoppedAt).toBeNull()
    await until(() => h.link.callsOf('host.silenceFacts').at(-1)?.stoppedAt === null)
    expect(h.link.callsOf('activity.record').filter(c => c.announce)).toHaveLength(0)
  })

  it('counts only from the pinned machine that sent it, and only as the bare word', async () => {
    const stranger = await FakeHost.create()
    stranger.consoleIdentity = office.consoleIdentity
    await h.ctx.commands.receive(await stranger.seal({ kind: 'stopping' }))
    await h.ctx.commands.receive(await office.seal({ kind: 'stopping', request: { op: 'erase' } } as never))
    expect((await fleetHost(office.fingerprint)).stoppedAt).toBeNull()
    expect(h.ctx.commands.dropped.map(d => d.reason)).toEqual(['unknown_sender', 'unexpected'])
    // Nothing was asked of any machine.
    expect(h.link.envelopes).toHaveLength(0)
  })
})
