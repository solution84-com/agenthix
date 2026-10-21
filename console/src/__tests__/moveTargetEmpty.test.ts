import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeJoinCode, type HostRequest } from '@agenthix/core'
import { MoveError } from '../move/moves'
import { loadOrCreateKeys } from '../state/keys'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

// The machine a site moves to carries no site until the move finishes: its record never takes the site's name from
// the move's code, and a move that ends without happening leaves it connected, with no site, ready for the next one.

let h: Harness
let auth: { cookie: string; csrf: string }
let office: FakeHost
let fresh: FakeHost
let third: FakeHost
const sam = { kind: 'fleetAdmin' as const, userId: 'u-sam', name: 'Sam' }

beforeEach(async () => {
  h = await startHarness()
  ;[office, fresh, third] = await Promise.all([FakeHost.create(), FakeHost.create(), FakeHost.create()])
  h.link.handle('join.open', () => ({ joinId: 'j-move' }))
  h.link.handle('join.accept', () => ({ hostId: 'h-new' }))
  h.link.handle('transfer.open', () => ({ opened: true }))
  h.link.handle('transfer.close', () => ({ closed: true }))
  h.link.handle('host.disconnect', () => ({ disconnected: true }))
  auth = await h.signIn()
  const fleetConsole = (await loadOrCreateKeys(h.state)).identity
  for (const host of [office, fresh, third]) host.consoleIdentity = fleetConsole
  await h.ctx.hosts.pin({
    fingerprint: office.fingerprint, hostId: 'h-office', identity: office.keys.identity, machineName: 'office-server',
    siteName: 'office', executionSiteId: 'es-office', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
  })
})
afterEach(async () => { await h.close() })

const api = (path: string, method = 'GET', body?: unknown) => h.request(path, { method, body, ...auth })
const online = (hostId: string, fingerprint: string) =>
  h.link.emit('presence', { hostId, fingerprint, online: true, since: new Date().toISOString() })

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

type FleetEntry = { fingerprint: string; siteName: string; move: unknown; endedMove: unknown }
const fleetEntry = async (fingerprint: string) =>
  ((await api('/api/fleet')).json.hosts as FleetEntry[]).find(x => x.fingerprint === fingerprint)

/** A move whose new machine joined with its code and was confirmed: it is armed and the old machine asked. */
async function confirmed(): Promise<{ askedOld: { requestId: string } }> {
  const started = await api(`/api/hosts/${office.fingerprint}/move`, 'POST', {})
  const code = normalizeJoinCode(started.json.code as string)!
  h.link.emit('joinRequest', await fresh.joinRequest('j-move', code, 'new-server'))
  await until(() => h.ctx.joins.get('j-move')?.state === 'confirming')
  expect((await api('/api/joins/j-move/confirm', 'POST', {})).status).toBe(200)
  online('h-new', fresh.fingerprint)
  const armed = await nextCommand(fresh, 0)
  await answer(fresh, armed.requestId, 'move', { transferId: (armed.request as { transferId: string }).transferId })
  return { askedOld: await nextCommand(office, 1) }
}

async function refusedByOldMachine(): Promise<void> {
  const { askedOld } = await confirmed()
  await h.ctx.commands.receive(await office.seal({
    kind: 'result', replyTo: askedOld.requestId, result: { ok: false, op: 'move', refusal: { code: 'conflict', message: 'The site on office-server has moved already.' } },
  }))
  await until(() => h.ctx.moves.list()[0]?.state === 'failed')
}

describe('the machine a site moves to @SC-875', () => {
  it('is pinned with no site name of its own while it waits: the move says what it receives', async () => {
    await confirmed()
    expect(h.ctx.hosts.byFingerprint(fresh.fingerprint)).toMatchObject({ siteName: '', executionSiteId: null })
    expect(await fleetEntry(fresh.fingerprint)).toMatchObject({ siteName: '', move: { role: 'receiving', siteName: 'office' }, endedMove: null })
  })

  it('stays connected with no site when the move ends without happening, and the fleet says the move to it did not happen', async () => {
    await refusedByOldMachine()
    expect(h.ctx.hosts.byFingerprint(fresh.fingerprint)).toMatchObject({ siteName: '', executionSiteId: null })
    expect(h.ctx.hosts.byFingerprint(office.fingerprint)).toMatchObject({ siteName: 'office', executionSiteId: 'es-office' })
    expect(await fleetEntry(fresh.fingerprint)).toMatchObject({ move: null, endedMove: { siteName: 'office', state: 'failed' } })
    expect(await fleetEntry(office.fingerprint)).toMatchObject({ endedMove: null })
  })

  it("drops a site name it was given if a move to it ends without happening, so one site is never listed on two machines", async () => {
    const { askedOld } = await confirmed()
    h.ctx.hosts.update(fresh.fingerprint, { siteName: 'office' })
    await h.ctx.commands.receive(await office.seal({
      kind: 'result', replyTo: askedOld.requestId, result: { ok: false, op: 'move', refusal: { code: 'conflict', message: 'No.' } },
    }))
    await until(() => h.ctx.moves.list()[0]?.state === 'failed')
    expect(h.ctx.hosts.byFingerprint(fresh.fingerprint)).toMatchObject({ siteName: '' })
  })
})

describe("the record of a move's new machine @SC-875", () => {
  it('is part of the move — the machine joined to receive the site — and is not announced as a site added', async () => {
    await confirmed()
    const records = h.link.callsOf('activity.record') as { action: string; subject: string; announce: boolean }[]
    expect(records.find(c => c.action === 'site.added')).toBeUndefined()
    expect(records.find(c => c.action === 'site.moveMachineJoined')).toMatchObject({
      subject: expect.stringMatching(/^new-server joined to receive office \(/), announce: false,
    })
  })

  it('names the machine alone once it carries no site, when it is disconnected', async () => {
    await refusedByOldMachine()
    expect((await api(`/api/hosts/${fresh.fingerprint}/disconnect`, 'POST', {})).status).toBe(200)
    const records = h.link.callsOf('activity.record') as { action: string; subject: string }[]
    expect(records.find(c => c.action === 'site.disconnected')?.subject).toMatch(/^new-server \(/)
  })
})

describe('a move to a machine already connected, with no site @SC-875', () => {
  it('is asked for with `to` on Move site…, and gives no code', async () => {
    await refusedByOldMachine()
    expect((await api(`/api/hosts/${office.fingerprint}/move`, 'POST', { to: 'not a fingerprint' })).status).toBe(400)
    const res = await api(`/api/hosts/${office.fingerprint}/move`, 'POST', { to: fresh.fingerprint })
    expect(res.status).toBe(201)
    expect(res.json).toMatchObject({ to: fresh.fingerprint, joinId: null, state: 'arranging' })
    expect(res.json.code).toBeUndefined()
    const refused = await api(`/api/hosts/${office.fingerprint}/move`, 'POST', { to: office.fingerprint })
    expect(refused.status).toBe(409)
  })

  it('arms that machine without a code, and the move to it reads as under way again', async () => {
    await refusedByOldMachine()
    const opened = h.link.callsOf('join.open').length
    const seen = h.link.envelopes.length
    const move = await h.ctx.moves.startTo(sam, office.fingerprint, fresh.fingerprint, null)
    expect(move).toMatchObject({ from: office.fingerprint, to: fresh.fingerprint, joinId: null, siteName: 'office', confirmedBy: { userId: 'u-sam' } })
    const armed = await nextCommand(fresh, seen)
    expect(armed.request).toMatchObject({ op: 'move', role: 'receive', peer: office.fingerprint, siteName: 'office' })
    expect(h.link.callsOf('join.open')).toHaveLength(opened)
    expect(await fleetEntry(fresh.fingerprint)).toMatchObject({ move: { role: 'receiving', siteName: 'office' }, endedMove: null })
  })

  it('is refused for a machine that carries a site, is offline, is the same machine, or is not connected', async () => {
    await h.ctx.hosts.pin({
      fingerprint: third.fingerprint, hostId: 'h-third', identity: third.keys.identity, machineName: 'third-box',
      siteName: 'third', executionSiteId: 'es-third', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
    })
    online('h-third', third.fingerprint)
    await expect(h.ctx.moves.startTo(sam, office.fingerprint, third.fingerprint, null)).rejects.toMatchObject({ status: 409, message: 'third-box already carries a site; a site moves only to a machine with no site.' })
    await expect(h.ctx.moves.startTo(sam, office.fingerprint, office.fingerprint, null)).rejects.toBeInstanceOf(MoveError)
    await expect(h.ctx.moves.startTo(sam, office.fingerprint, 'a'.repeat(64), null)).rejects.toMatchObject({ status: 404 })

    h.ctx.hosts.update(third.fingerprint, { executionSiteId: null, siteName: '' })
    h.link.emit('presence', { hostId: 'h-third', fingerprint: third.fingerprint, online: false, since: new Date().toISOString() })
    await expect(h.ctx.moves.startTo(sam, office.fingerprint, third.fingerprint, null)).rejects.toMatchObject({ status: 409, message: 'third-box is not answering; a site moves only to a machine that is online.' })
    expect(h.ctx.moves.list()).toEqual([])
  })
})
