/** hq telling its host services and the Fleet Console the address it moves to (host-management spec §13). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hostLink, consoleLink, opened, startHarness, type Harness } from './relayHarness'

let h: Harness
beforeEach(async () => {
  h = await startHarness()
  h.hosts.set('cred-a', { hostId: 'h1', fingerprint: 'a'.repeat(64), consoleFingerprint: 'm'.repeat(64) })
  h.hosts.set('cred-b', { hostId: 'h2', fingerprint: 'b'.repeat(64), consoleFingerprint: 'm'.repeat(64) })
})
afterEach(() => h.close())

describe('the new address over the relay @SC-935', () => {
  it('reaches every connected host service and the Fleet Console', async () => {
    const m = consoleLink(h, { Authorization: `Bearer ${h.consoleSecret}` })
    await opened(m)
    const a = hostLink(h, { Authorization: 'Bearer cred-a' })
    const b = hostLink(h, { Authorization: 'Bearer cred-b' })
    await Promise.all([opened(a), opened(b)])
    await m.next('host.presence')
    await m.next('host.presence')

    expect(h.hub.tellAddress('http://198.51.100.24:4100')).toEqual({ hosts: 2, console: true })
    for (const c of [a, b, m]) expect((await c.next('hq.address')).payload).toEqual({ address: 'http://198.51.100.24:4100' })
  })

  it('tells the Fleet Console whose role was removed, and no host service @SC-920', async () => {
    const m = consoleLink(h, { Authorization: `Bearer ${h.consoleSecret}` })
    await opened(m)
    expect(h.hub.tellFleetAdminRemoved('u-jordan')).toBe(true)
    expect((await m.next('fleetAdmin.removed')).payload).toEqual({ userId: 'u-jordan' })
  })

  it('tells no one when nothing is connected', () => {
    expect(h.hub.tellFleetAdminRemoved('u-jordan')).toBe(false)
    expect(h.hub.tellAddress('http://198.51.100.24:4100')).toEqual({ hosts: 0, console: false })
  })
})
