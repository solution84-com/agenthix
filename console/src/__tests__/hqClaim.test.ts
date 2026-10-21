/**
 * HQ's machine marked again under a Fleet Console started anew (spec §7, `hq console-code --no-machines`): its join says
 * "this machine runs HQ" under the binding, the fleet admin sees it, and only their confirmation sets the mark — while
 * no machine holds it. hq relays the join without the code, so it can neither make the claim nor change it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeJoinCode } from '@agenthix/core'
import { FakeHost, flush, until } from './fakes'
import { startHarness, type Harness } from './harness'

let h: Harness
let auth: { cookie: string; csrf: string }
let host: FakeHost

beforeEach(async () => {
  h = await startHarness()
  host = await FakeHost.create()
  h.link.handle('join.open', () => ({ joinId: 'j-1' }))
  h.link.handle('join.accept', () => ({ hostId: 'h-hq' }))
  h.link.handle('join.refuse', () => ({ refused: true }))
  auth = await h.signIn()
})
afterEach(async () => { await h.close() })

const api = (path: string, method = 'GET', body?: unknown) => h.request(path, { method, body, ...auth })
const marked = () => h.ctx.hosts.list().filter(m => m.hqMachine === true).map(m => m.fingerprint)

async function openCode(): Promise<string> {
  const res = await api('/api/joins', 'POST', {})
  expect(res.status).toBe(201)
  return normalizeJoinCode(res.json.code as string)!
}

async function claimed(code: string): Promise<void> {
  h.link.emit('joinRequest', await host.joinRequest('j-1', code, 'hq-box', { runsHq: true }))
  await until(() => h.ctx.joins.get('j-1')?.state === 'confirming')
}

describe("a machine that says it runs HQ @SC-872", () => {
  it('shows the claim to the fleet admin, and marks it only on their confirmation, installing no site of its own', async () => {
    await claimed(await openCode())
    const shown = await api('/api/joins/j-1')
    expect(shown.json.hqClaim).toEqual({ text: 'This machine says it runs HQ.', marks: true })
    // Nothing is pinned, let alone marked, before the fleet admin confirms.
    expect(h.ctx.hosts.list()).toEqual([])

    const confirmed = await api('/api/joins/j-1/confirm', 'POST', {})
    expect(confirmed.status).toBe(200)
    expect(confirmed.json).toMatchObject({ state: 'done', problem: null })
    expect(marked()).toEqual([host.fingerprint])
    expect(h.link.callsOf('activity.record').find(c => c.action === 'hq.machineMarked')).toMatchObject({ byUserId: 'u-sam', announce: true })

    // HQ's own site runs there already: nothing is asked of the machine.
    h.link.emit('presence', { hostId: 'h-hq', fingerprint: host.fingerprint, online: true, since: new Date().toISOString() })
    await new Promise(r => setTimeout(r, 30))
    expect(h.link.envelopes).toEqual([])
    expect(h.link.callsOf('site.register')).toEqual([])
  })

  it('is not marked while another machine holds the mark, and the fleet admin is told before confirming', async () => {
    const other = await FakeHost.create()
    await h.ctx.hosts.pin({
      fingerprint: other.fingerprint, hostId: 'h-other', identity: other.keys.identity, machineName: 'old-box', siteName: 'old-box',
      executionSiteId: null, connectedAt: new Date().toISOString(), connectedBy: null, hqMachine: true,
    })
    await claimed(await openCode())
    expect((await api('/api/joins/j-1')).json.hqClaim).toEqual({
      text: "This machine says it runs HQ, but old-box is already marked as HQ's machine, so confirming does not mark this one.",
      marks: false,
    })
    const confirmed = await api('/api/joins/j-1/confirm', 'POST', {})
    expect(confirmed.status).toBe(200)
    expect(marked()).toEqual([other.fingerprint])
    expect(h.ctx.hosts.byFingerprint(host.fingerprint)?.hqMachine).toBeUndefined()
    expect(h.link.callsOf('activity.record').some(c => c.action === 'hq.machineMarked')).toBe(false)
  })

  it('marks nothing when the fleet admin turns the machine away', async () => {
    await claimed(await openCode())
    expect((await api('/api/joins/j-1/refuse', 'POST', {})).status).toBe(204)
    expect(h.ctx.hosts.list()).toEqual([])
  })
})

describe('what hq can do to the claim @SC-872', () => {
  it('cannot add it to a join that did not make it', async () => {
    const code = await openCode()
    h.link.emit('joinRequest', { ...(await host.joinRequest('j-1', code, 'hq-box')), runsHq: true })
    await new Promise(r => setTimeout(r, 20))
    expect(h.ctx.joins.get('j-1')).toMatchObject({ state: 'waiting', machine: null })
  })

  it('cannot drop it from a join that made it, nor say it some other way', async () => {
    const code = await openCode()
    const { runsHq: _dropped, ...stripped } = await host.joinRequest('j-1', code, 'hq-box', { runsHq: true })
    h.link.emit('joinRequest', stripped)
    h.link.emit('joinRequest', { ...(await host.joinRequest('j-1', code, 'hq-box', { runsHq: true })), runsHq: 'yes' })
    await new Promise(r => setTimeout(r, 20))
    expect(h.ctx.joins.get('j-1')).toMatchObject({ state: 'waiting', machine: null })
  })

  it('cannot claim it for a machine of its own: without the code its binding proves nothing', async () => {
    await openCode()
    h.link.emit('joinRequest', await host.joinRequest('j-1', 'ZZZZZZZZZZZZ', 'hq-box', { runsHq: true }))
    await flush()
    await new Promise(r => setTimeout(r, 20))
    expect(h.ctx.joins.get('j-1')).toMatchObject({ state: 'waiting' })
    expect(marked()).toEqual([])
  })
})
