import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeJoinCode, type HostMessage, type HostRequest } from '@agenthix/core'
import { joinLookup } from '@agenthix/core/host-crypto'
import { loadOrCreateKeys } from '../state/keys'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

let h: Harness
let auth: { cookie: string; csrf: string }
let office: FakeHost
let fresh: FakeHost
let third: FakeHost

beforeEach(async () => {
  h = await startHarness()
  ;[office, fresh, third] = await Promise.all([FakeHost.create(), FakeHost.create(), FakeHost.create()])
  h.link.handle('join.open', () => ({ joinId: 'j-move' }))
  h.link.handle('join.accept', () => ({ hostId: 'h-new' }))
  h.link.handle('transfer.open', () => ({ opened: true }))
  h.link.handle('transfer.close', () => ({ closed: true }))
  h.link.handle('site.move', () => ({ moved: true }))
  h.link.handle('host.disconnect', () => ({ disconnected: true }))
  auth = await h.signIn()
  // Each machine pinned this Fleet Console when it joined.
  const fleetConsole = (await loadOrCreateKeys(h.state)).identity
  for (const host of [office, fresh, third]) host.consoleIdentity = fleetConsole
  await h.ctx.hosts.pin({
    fingerprint: office.fingerprint, hostId: 'h-office', identity: office.keys.identity, machineName: 'office-server',
    siteName: 'office-server', executionSiteId: 'es-office', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
  })
})
afterEach(async () => { await h.close() })

const api = (path: string, method = 'GET', body?: unknown) => h.request(path, { method, body, ...auth })
const online = (hostId: string, fingerprint: string) =>
  h.link.emit('presence', { hostId, fingerprint, online: true, since: new Date().toISOString() })

/** The next command the console sealed to `host`, opened as that host would. */
async function nextCommand(host: FakeHost, seen: number): Promise<{ requestId: string; request: HostRequest }> {
  const end = Date.now() + 2_000
  while (Date.now() < end) {
    for (const env of h.link.envelopes.slice(seen)) {
      if (env.to !== host.fingerprint) continue
      const opened = await host.open(env)
      // Only a command: the host may be sent other messages in between, depending on timing.
      if (opened.ok && (opened.message as { request?: unknown }).request) return opened.message as { requestId: string; request: HostRequest }
    }
    await new Promise(r => setTimeout(r, 5))
  }
  throw new Error('no command for that host')
}

async function answer(host: FakeHost, requestId: string, op: HostRequest['op'], result: unknown): Promise<void> {
  await h.ctx.commands.receive(await host.seal({ kind: 'result', replyTo: requestId, result: { ok: true, op, result } as never }))
}

const tell = async (host: FakeHost, message: HostMessage) => h.ctx.commands.receive(await host.seal(message))

/** A move started, the new machine joined with its code and confirmed, and both machines asked. */
async function underWay(): Promise<{ transferId: string }> {
  const started = await api(`/api/hosts/${office.fingerprint}/move`, 'POST', {})
  expect(started.status).toBe(201)
  const code = normalizeJoinCode(started.json.code as string)!
  h.link.emit('joinRequest', await fresh.joinRequest('j-move', code, 'new-server'))
  await until(() => h.ctx.joins.get('j-move')?.state === 'confirming')
  expect((await api('/api/joins/j-move/confirm', 'POST', {})).status).toBe(200)
  online('h-new', fresh.fingerprint)

  const armed = await nextCommand(fresh, 0)
  expect(armed.request).toMatchObject({ op: 'move', role: 'receive', peer: office.fingerprint, peerIdentity: office.keys.identity, siteName: 'office-server' })
  await answer(fresh, armed.requestId, 'move', { transferId: (armed.request as { transferId: string }).transferId })
  await until(() => h.link.callsOf('transfer.open').length === 1)
  const asked = await nextCommand(office, 1)
  expect(asked.request).toMatchObject({ op: 'move', role: 'send', peer: fresh.fingerprint, peerIdentity: fresh.keys.identity, peerName: 'new-server' })
  const transferId = (asked.request as { transferId: string }).transferId
  await answer(office, asked.requestId, 'move', { transferId })
  await until(() => h.ctx.moves.list()[0]?.state === 'running')
  return { transferId }
}

describe('Move site… @SC-873', () => {
  it('gives a code whose lookup alone reaches hq, for a join that installs nothing', async () => {
    const started = await api(`/api/hosts/${office.fingerprint}/move`, 'POST', { at: new Date(Date.now() + 86_400_000).toISOString() })
    const code = normalizeJoinCode(started.json.code as string)!
    const [open] = h.link.callsOf('join.open')
    expect(open).toEqual({ lookup: await joinLookup(code), expiresAt: expect.any(String), purpose: { kind: 'moveSite', siteId: 'es-office' } })
    expect(h.link.wire()).not.toContain(code)
    expect(started.json).toMatchObject({ state: 'waitingForMachine', siteName: 'office-server' })
  })

  it("arms the new machine, opens the transfer, asks the old machine; the new one shows as waiting to receive the site", async () => {
    const { transferId } = await underWay()
    expect(h.link.callsOf('transfer.open')).toEqual([{ transferId, fromHostId: 'h-office', toHostId: 'h-new', expiresAt: expect.any(String) }])
    // No install went to the new machine: it waits for the site.
    for (const env of h.link.envelopes.filter(e => e.to === fresh.fingerprint)) {
      const opened = await fresh.open(env)
      expect(opened.ok && (opened.message as { request: { op: string } }).request.op).not.toBe('install')
    }
    const fleet = await api('/api/fleet')
    const newHost = (fleet.json.hosts as { fingerprint: string; move: unknown }[]).find(x => x.fingerprint === fresh.fingerprint)
    expect(newHost?.move).toMatchObject({ role: 'receiving', siteName: 'office-server' })
  })

  it('once the site answers from the new machine: hq records it there, the old copy is removed, the old machine leaves', async () => {
    const { transferId } = await underWay()
    const seen = h.link.envelopes.length
    await tell(fresh, { kind: 'move', report: { transferId, state: 'tookOver', reason: null } })
    const remove = await nextCommand(office, seen)
    expect(remove.request).toEqual({ op: 'remove', target: 'site' })
    expect(h.link.callsOf('site.move')).toEqual([{ executionSiteId: 'es-office', toHostId: 'h-new' }])
    await answer(office, remove.requestId, 'remove', { state: 'removed' })
    await until(() => h.ctx.moves.list()[0]?.state === 'done')
    expect(h.link.callsOf('host.disconnect')).toEqual([{ hostId: 'h-office' }])
    expect(h.ctx.hosts.byFingerprint(office.fingerprint)).toBeNull()
    // The site takes the new machine's name, and the move says so.
    expect(h.ctx.hosts.byFingerprint(fresh.fingerprint)).toMatchObject({ executionSiteId: 'es-office', siteName: 'new-server' })
    expect(h.link.callsOf('activity.record').find(c => c.action === 'site.moved')).toMatchObject({
      announce: true, subject: 'office-server now runs on new-server, and is named new-server; the machine it ran on left the fleet',
    })
  })

  it('reads as not completed when the old machine put the site back, and takes no word from a third machine', async () => {
    const { transferId } = await underWay()
    await h.ctx.hosts.pin({
      fingerprint: third.fingerprint, hostId: 'h-third', identity: third.keys.identity, machineName: 'third',
      siteName: 'third', executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
    })
    await tell(third, { kind: 'move', report: { transferId, state: 'tookOver', reason: null } })
    expect(h.link.callsOf('site.move')).toEqual([])
    await tell(office, { kind: 'move', report: { transferId, state: 'rolledBack', reason: 'the site did not answer HQ from new-server in time.' } })
    await until(() => h.ctx.moves.list()[0]?.state === 'failed')
    expect(h.ctx.moves.list()[0].problem).toBe('The site did not answer HQ from new-server in time. The site runs on office-server again.')
    await until(() => h.link.callsOf('transfer.close').length > 0)
    expect(h.link.callsOf('transfer.close')).toEqual([{ transferId }])
    expect(h.ctx.hosts.byFingerprint(office.fingerprint)).toMatchObject({ executionSiteId: 'es-office' })
  })

  it('ends as soon as the new machine gives up, and then reads that the old machine runs the site again', async () => {
    const { transferId } = await underWay()
    await tell(fresh, { kind: 'move', report: { transferId, state: 'failed', reason: 'the site stopped on new-server as soon as it started.' } })
    await until(() => h.ctx.moves.list()[0]?.state === 'failed')
    expect(h.ctx.moves.list()[0]).toMatchObject({
      reports: { to: 'failed' },
      problem: 'The site stopped on new-server as soon as it started. The site starts again on office-server.',
    })
    await tell(office, { kind: 'move', report: { transferId, state: 'rolledBack', reason: 'the site stopped on new-server as soon as it started.' } })
    await until(() => h.ctx.moves.list()[0]?.reports.from === 'rolledBack')
    expect(h.ctx.moves.list()[0]).toMatchObject({
      state: 'failed',
      problem: 'The site stopped on new-server as soon as it started. The site runs on office-server again.',
    })
    expect(h.link.callsOf('activity.record').filter(c => c.action === 'site.moveFailed')).toHaveLength(1)
  })

  it('when the old machine refuses, tells the new one why, sealed, so it stops waiting; and says why once', async () => {
    const started = await api(`/api/hosts/${office.fingerprint}/move`, 'POST', {})
    const code = normalizeJoinCode(started.json.code as string)!
    h.link.emit('joinRequest', await fresh.joinRequest('j-move', code, 'new-server'))
    await until(() => h.ctx.joins.get('j-move')?.state === 'confirming')
    await api('/api/joins/j-move/confirm', 'POST', {})
    online('h-new', fresh.fingerprint)
    const armed = await nextCommand(fresh, 0)
    const transferId = (armed.request as { transferId: string }).transferId
    await answer(fresh, armed.requestId, 'move', { transferId })
    const asked = await nextCommand(office, 1)
    const seen = h.link.envelopes.length
    await h.ctx.commands.receive(await office.seal({
      kind: 'result', replyTo: asked.requestId, result: { ok: false, op: 'move', refusal: { code: 'conflict', message: 'The site on office-server has moved already.' } },
    }))
    await until(() => h.ctx.moves.list()[0]?.state === 'failed')
    expect(h.ctx.moves.list()[0].problem).toBe('The site on office-server has moved already. The site still runs on office-server.')
    // The new machine is told before hq drops the transfer.
    await until(() => h.link.callsOf('transfer.close').length > 0)
    let ended: unknown = null
    for (const env of h.link.envelopes.slice(seen).filter(e => e.to === fresh.fingerprint)) {
      const opened = await fresh.open(env)
      if (opened.ok) ended = opened.message
    }
    expect(ended).toEqual({ kind: 'moveEnded', transferId, reason: 'The site on office-server has moved already.' })
    expect(h.link.callsOf('transfer.close')).toEqual([{ transferId }])
  })

  it("answers the site's machine admin with a code sealed to that machine, and refuses HQ's own site", async () => {
    const seen = h.link.envelopes.length
    await tell(office, { kind: 'moveCodeAsk', askId: 'ask-1', at: new Date(Date.now() + 86_400_000).toISOString() })
    await until(() => h.link.envelopes.length > seen)
    const opened = await office.open(h.link.envelopes[seen])
    if (!opened.ok) throw new Error(opened.reason)
    const reply = opened.message as { kind: string; replyTo: string; code: string }
    expect(reply).toMatchObject({ kind: 'moveCode', replyTo: 'ask-1', problem: null })
    expect(normalizeJoinCode(reply.code)).not.toBeNull()
    expect(h.link.wire()).not.toContain(normalizeJoinCode(reply.code)!)
    expect(h.ctx.moves.list()[0]).toMatchObject({ by: null, state: 'waitingForMachine' })

    await h.ctx.hosts.pin({
      fingerprint: third.fingerprint, hostId: 'h-hq', identity: third.keys.identity, machineName: 'hq-box',
      siteName: 'hq-box', executionSiteId: 'es-default', connectedAt: new Date().toISOString(), connectedBy: null, hqMachine: true,
    })
    const refused = await api(`/api/hosts/${third.fingerprint}/move`, 'POST', {})
    expect(refused).toMatchObject({ status: 409, json: { message: "HQ's site moves with HQ, with Move HQ…." } })
  })
})
