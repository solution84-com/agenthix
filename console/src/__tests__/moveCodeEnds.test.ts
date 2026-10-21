import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JOIN_CODE_TTL_MS, normalizeJoinCode } from '@agenthix/core'
import { FakeHost, until } from './fakes'
import { startHarness, type Harness } from './harness'

// A move whose code runs out, or whose machine is refused, ends by itself (spec §13): nothing was asked of either
// machine yet, so the site keeps running where it was, and the move reads so.

let h: Harness
let auth: { cookie: string; csrf: string }
let office: FakeHost
let fresh: FakeHost

beforeEach(async () => {
  h = await startHarness()
  ;[office, fresh] = await Promise.all([FakeHost.create(), FakeHost.create()])
  h.link.handle('join.open', () => ({ joinId: 'j-move' }))
  h.link.handle('join.refuse', () => ({ refused: true }))
  h.link.handle('join.close', () => ({ closed: true }))
  auth = await h.signIn()
  await h.ctx.hosts.pin({
    fingerprint: office.fingerprint, hostId: 'h-office', identity: office.keys.identity, machineName: 'office-server',
    siteName: 'office', executionSiteId: 'es-office', connectedAt: new Date().toISOString(), connectedBy: 'u-sam',
  })
})
afterEach(async () => {
  vi.useRealTimers()
  await h.close()
})

const api = (path: string, method = 'GET', body?: unknown) => h.request(path, { method, body, ...auth })

async function started(): Promise<{ moveId: string; code: string }> {
  const res = await api(`/api/hosts/${office.fingerprint}/move`, 'POST', {})
  expect(res.status).toBe(201)
  return { moveId: res.json.moveId as string, code: normalizeJoinCode(res.json.code as string)! }
}

function nothingAskedOfEitherMachine(): void {
  expect(h.link.envelopes.filter(e => e.to === office.fingerprint || e.to === fresh.fingerprint)).toEqual([])
  expect(h.link.callsOf('transfer.open')).toEqual([])
  expect(h.ctx.hosts.byFingerprint(office.fingerprint)).toMatchObject({ executionSiteId: 'es-office' })
}

describe('a move whose code ends before a machine is confirmed @SC-874', () => {
  it('ends as not done when the code runs out, and the site still runs where it was', async () => {
    const { moveId } = await started()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + JOIN_CODE_TTL_MS + 1_000)
    expect(h.ctx.moves.get(moveId)).toMatchObject({
      state: 'failed',
      problem: 'The code ran out before a new machine connected with it. The site still runs on office-server.',
    })
    vi.useRealTimers()
    nothingAskedOfEitherMachine()
    await until(() => h.link.callsOf('activity.record').some(c => c.action === 'site.moveFailed'))
  })

  it('ends as not done when the machine that used the code is refused, and frees the site to move again', async () => {
    const { moveId, code } = await started()
    h.link.emit('joinRequest', await fresh.joinRequest('j-move', code, 'new-server'))
    await until(() => h.ctx.joins.get('j-move')?.state === 'confirming')
    expect((await api('/api/joins/j-move/refuse', 'POST', {})).status).toBe(204)

    const move = await api(`/api/moves/${moveId}`)
    expect(move.json.move).toMatchObject({
      state: 'failed',
      problem: 'Its code was refused or withdrawn before a new machine was confirmed. The site still runs on office-server.',
    })
    const fleet = await api('/api/fleet')
    expect((fleet.json.hosts as { fingerprint: string; move: unknown }[]).find(x => x.fingerprint === office.fingerprint)?.move).toBeNull()
    nothingAskedOfEitherMachine()
    expect((await api(`/api/hosts/${office.fingerprint}/move`, 'POST', {})).status).toBe(201)
  })

  it('reads as cancelled, not failed, when the fleet admin cancels it while it waits', async () => {
    const { moveId } = await started()
    expect((await api(`/api/moves/${moveId}`, 'DELETE')).json.move).toMatchObject({ state: 'cancelled' })
    expect((await api(`/api/moves/${moveId}`)).json.move).toMatchObject({ state: 'cancelled' })
  })
})
