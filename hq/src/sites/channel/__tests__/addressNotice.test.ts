import { describe, it, expect } from 'vitest'
import { SITE_HQ_ADDRESS_METHOD } from '@agenthix/core'
import { SiteChannelRegistry } from '../siteChannelRegistry'
import type { SiteStatusStore } from '../siteStatusStore'
import { tellSitesNewAddress } from '../addressNotice'

const store: SiteStatusStore = {
  markOnline: async () => {}, markOffline: async () => {}, touch: async () => {},
  recordProtocolVersion: async () => {}, markVersionMismatch: async () => {},
}

/** A site's socket that answers each request as `answer` says, through the registry as the channel server would. */
function site(registry: SiteChannelRegistry, id: string, answer: (method: string, params: unknown) => unknown) {
  const asked: { method: string; params: unknown }[] = []
  const ws = {
    send(raw: string) {
      const msg = JSON.parse(raw) as { requestId: string; payload: { method: string; params: unknown } }
      asked.push(msg.payload)
      const result = answer(msg.payload.method, msg.payload.params)
      queueMicrotask(() => registry.get(id)?.pending.settle(msg.requestId, result))
    },
    close() {},
  }
  return { ws, asked }
}

describe("telling sites hq's new address", () => {
  it('tells every connected site but the default one, over its channel, and counts those that took it', async () => {
    const registry = new SiteChannelRegistry(store)
    const office = site(registry, 'office', () => ({ taken: true }))
    const laptop = site(registry, 'laptop', () => ({ taken: false, problem: 'plain http' }))
    const own = site(registry, 'hq-box', () => ({ taken: true }))
    await registry.add('office', office.ws as never)
    await registry.add('laptop', laptop.ws as never)
    await registry.add('hq-box', own.ws as never)

    expect(await tellSitesNewAddress(registry, 'http://198.51.100.24:4100', 'hq-box')).toEqual({ told: 1, online: 2 })
    expect(office.asked).toEqual([{ method: SITE_HQ_ADDRESS_METHOD, params: { address: 'http://198.51.100.24:4100' }, features: {} }])
    expect(own.asked).toEqual([])
  })
})
