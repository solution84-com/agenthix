/**
 * *Move HQ…* to a new machine (spec §13), as the Fleet Console carries it out: the same code, confirmation and signed
 * requests as *Move site…*, with hq's own machine — the one this Fleet Console marked `hqMachine` — as the old one. The
 * mark moves only by the Fleet Console's own record of the move, on the new machine's sealed word; never on hq's.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeJoinCode, type HostMessage, type HostRequest } from '@agenthix/core'
import { generateHostKeys, joinLookup } from '@agenthix/core/host-crypto'
import { loadOrCreateKeys } from '../state/keys'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

const NEW = 'http://192.168.1.30:4100'

let h: Harness
let auth: { cookie: string; csrf: string }
let hqBox: FakeHost
let fresh: FakeHost
let third: FakeHost

beforeEach(async () => {
  h = await startHarness()
  ;[hqBox, fresh, third] = await Promise.all([FakeHost.create(), FakeHost.create(), FakeHost.create()])
  for (const [method, answer] of [['join.open', { joinId: 'j-hq' }], ['join.accept', { hostId: 'h-new' }], ['transfer.open', { opened: true }],
    ['transfer.close', { closed: true }], ['site.move', { moved: true }], ['host.disconnect', { disconnected: true }]] as const) {
    h.link.handle(method, () => answer)
  }
  auth = await h.signIn()
  const fleetConsole = (await loadOrCreateKeys(h.state)).identity
  for (const host of [hqBox, fresh, third]) host.consoleIdentity = fleetConsole
  await h.ctx.hosts.pin({
    fingerprint: hqBox.fingerprint, hostId: 'h-hq', identity: hqBox.keys.identity, machineName: 'hq-box',
    siteName: 'hq-box', executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: null, hqMachine: true,
  })
  await h.ctx.hosts.pin({
    fingerprint: third.fingerprint, hostId: 'h-third', identity: third.keys.identity, machineName: 'office-server',
    siteName: 'office', executionSiteId: 'es-office', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
  })
})
afterEach(async () => { await h.close() })

const api = (path: string, method = 'GET', body?: unknown) => h.request(path, { method, body, ...auth })
const marked = () => h.ctx.hosts.list().filter(x => x.hqMachine).map(x => x.machineName)

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

async function underWay(): Promise<{ transferId: string }> {
  const started = await api('/api/hq/move', 'POST', { hqAddress: NEW })
  expect(started.status).toBe(201)
  const code = normalizeJoinCode(started.json.code as string)!
  expect(h.link.callsOf('join.open')[0]).toEqual({ lookup: await joinLookup(code), expiresAt: expect.any(String), purpose: { kind: 'moveHq' } })
  h.link.emit('joinRequest', await fresh.joinRequest('j-hq', code, 'new-server'))
  await until(() => h.ctx.joins.get('j-hq')?.state === 'confirming')
  expect((await api('/api/joins/j-hq/confirm', 'POST', {})).status).toBe(200)
  h.link.emit('presence', { hostId: 'h-new', fingerprint: fresh.fingerprint, online: true, since: new Date().toISOString() })

  const armed = await nextCommand(fresh, 0)
  expect(armed.request).toMatchObject({ op: 'move', role: 'receive', target: 'hq', peer: hqBox.fingerprint, siteName: 'hq-box', hqAddress: NEW })
  await answer(fresh, armed.requestId, 'move', { transferId: (armed.request as { transferId: string }).transferId })
  const asked = await nextCommand(hqBox, 1)
  expect(asked.request).toMatchObject({ op: 'move', role: 'send', target: 'hq', peer: fresh.fingerprint, hqAddress: NEW })
  // Written down as running before hq's machine was asked: a Fleet Console beside hq goes with hq's backup.
  expect(h.ctx.moves.list()[0]).toMatchObject({ kind: 'hq', state: 'running' })
  const transferId = (asked.request as { transferId: string }).transferId
  await answer(hqBox, asked.requestId, 'move', { transferId })
  return { transferId }
}

describe('Move HQ… to a new machine @SC-876', () => {
  it('when the new machine says HQ answers there: the mark moves to it, the old copy is removed, the old machine leaves', async () => {
    const { transferId } = await underWay()
    const seen = h.link.envelopes.length
    await tell(fresh, { kind: 'move', report: { transferId, state: 'tookOver', reason: null } })
    const remove = await nextCommand(hqBox, seen)
    expect(remove.request).toEqual({ op: 'remove', target: 'hq' })
    expect(marked()).toEqual(['new-server'])
    expect(h.link.callsOf('site.move')).toEqual([])
    await answer(hqBox, remove.requestId, 'remove', { state: 'removed' })
    await until(() => h.ctx.moves.list()[0]?.state === 'done')
    expect(h.link.callsOf('host.disconnect')).toEqual([{ hostId: 'h-hq' }])
    expect(h.ctx.hosts.byFingerprint(hqBox.fingerprint)).toBeNull()
    // Its outcome stays held, so its notice opens it (http/routes/noticeTarget.ts).
    expect(h.ctx.moves.of(fresh.fingerprint)).toBeNull()
    expect(h.ctx.moves.lastOf(fresh.fingerprint)).toMatchObject({ kind: 'hq', state: 'done' })
    // HQ's site is named after the machine it runs on now.
    expect(h.ctx.hosts.byFingerprint(fresh.fingerprint)).toMatchObject({ siteName: 'new-server', hqMachine: true })
    expect(h.link.callsOf('activity.record').find(c => c.action === 'hq.moved')).toMatchObject({
      announce: true, subject: 'HQ now runs on new-server, and its site is named new-server; the machine it ran on left the fleet',
    })
  })

  it('the mark cannot be moved by a message from hq', async () => {
    const { transferId } = await underWay()
    const report: HostMessage = { kind: 'move', report: { transferId, state: 'tookOver', reason: null } }
    // hq makes up the new machine's word with a key of its own, and passes it under the new machine's name.
    const stranger = await generateHostKeys('host')
    const forged = await fresh.seal(report, stranger)
    await h.ctx.commands.receive({ ...forged, from: fresh.fingerprint })
    await h.ctx.commands.receive(forged)
    // A machine of the fleet that is not the move's says it, as hq might have it.
    await tell(third, report)
    // hq says through its link that the new machine is online, and carries every other frame it likes.
    h.link.emit('presence', { hostId: 'h-new', fingerprint: fresh.fingerprint, online: true, since: new Date().toISOString() })
    await new Promise(r => setTimeout(r, 50))
    expect(marked()).toEqual(['hq-box'])
    expect(h.ctx.moves.list()[0].state).toBe('running')
    expect(h.ctx.hosts.byFingerprint(hqBox.fingerprint)).not.toBeNull()
  })

  it('is asked only of the machine marked as HQ’s, by a fleet admin or that machine’s admin', async () => {
    const seen = h.link.envelopes.length
    await tell(third, { kind: 'moveCodeAsk', askId: 'ask-1', at: new Date(Date.now() + 86_400_000).toISOString(), target: 'hq' })
    await until(() => h.link.envelopes.length > seen)
    const opened = await third.open(h.link.envelopes[seen])
    if (!opened.ok) throw new Error(opened.reason)
    expect(opened.message).toMatchObject({ kind: 'moveCode', replyTo: 'ask-1', code: null, problem: "Only HQ's own machine asks to move HQ." })

    await tell(hqBox, { kind: 'moveCodeAsk', askId: 'ask-2', at: new Date(Date.now() + 86_400_000).toISOString(), target: 'hq', hqAddress: NEW })
    await until(() => h.ctx.moves.list().length === 1)
    expect(h.ctx.moves.list()[0]).toMatchObject({ kind: 'hq', hqAddress: NEW, from: hqBox.fingerprint, by: null })
  })

  it('reads as not completed when hq stays on its machine, which keeps the mark', async () => {
    const { transferId } = await underWay()
    await tell(hqBox, { kind: 'move', report: { transferId, state: 'rolledBack', reason: 'HQ did not answer on new-server in time.' } })
    await until(() => h.ctx.moves.list()[0]?.state === 'failed')
    expect(h.ctx.moves.list()[0].problem).toBe('HQ did not answer on new-server in time. HQ runs where it was.')
    expect(marked()).toEqual(['hq-box'])
  })

  it('is refused when no machine is known here as HQ’s', async () => {
    h.ctx.hosts.remove(hqBox.fingerprint)
    expect(await api('/api/hq/move', 'POST', {})).toMatchObject({ status: 409 })
  })
})
