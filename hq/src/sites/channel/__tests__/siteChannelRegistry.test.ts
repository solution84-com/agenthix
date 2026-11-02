import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { SiteChannelRegistry } from '../siteChannelRegistry'
import type { SiteStatusStore } from '../siteStatusStore'

function fakeStore(): SiteStatusStore & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    markOnline: async (id) => void calls.push(`online:${id}`),
    markOffline: async (id) => void calls.push(`offline:${id}`),
    touch: async (id) => void calls.push(`touch:${id}`),
    recordProtocolVersion: async () => {},
    markVersionMismatch: async () => {},
  }
}

function fakeSocket() {
  return {
    sent: [] as string[],
    closed: null as null | number,
    send(raw: string) { this.sent.push(raw) },
    close(code: number) { this.closed = code },
  }
}

let store: ReturnType<typeof fakeStore>
let registry: SiteChannelRegistry

beforeEach(() => {
  store = fakeStore()
  registry = new SiteChannelRegistry(store)
})

describe('live connections @SC-292', () => {
  it('reports a site online once it is holding a connection', async () => {
    const ws = fakeSocket()
    await registry.add('s1', ws as never)
    expect(registry.isOnline('s1')).toBe(true)
    expect(store.calls).toContain('online:s1')
  })

  it('reports it offline when that connection closes', async () => {
    const ws = fakeSocket()
    await registry.add('s1', ws as never)
    await registry.remove('s1', ws as never)
    expect(registry.isOnline('s1')).toBe(false)
    expect(store.calls).toContain('offline:s1')
  })
})

describe('live connections @SC-297', () => {
  it('lets the newer connection win and closes the older one', async () => {
    const first = fakeSocket()
    const second = fakeSocket()
    await registry.add('s1', first as never)
    await registry.add('s1', second as never)
    expect(first.closed).toBe(4000)
    expect(registry.get('s1')?.ws).toBe(second as never)
  })

  it('does not let the displaced connection report the site offline', async () => {
    // The old socket's close event lands after the new one is already
    // registered. Without the identity check it would mark a live site
    // offline, and dispatch would then refuse to route work to a site that is
    // sitting there connected.
    const first = fakeSocket()
    const second = fakeSocket()
    await registry.add('s1', first as never)
    await registry.add('s1', second as never)
    await registry.remove('s1', first as never)
    expect(registry.isOnline('s1')).toBe(true)
    expect(store.calls.filter(c => c === 'offline:s1')).toHaveLength(0)
  })
})

describe('asking a site a question @SC-295', () => {
  it('sends a correlated request and resolves on the matching reply', async () => {
    const ws = fakeSocket()
    const conn = await registry.add('s1', ws as never)

    const answer = registry.request('s1', 'site.describe', {})
    const sent = JSON.parse(ws.sent[0])
    expect(sent).toMatchObject({
      version: SITE_PROTOCOL_VERSION,
      type: 'channel.request',
      siteId: 's1',
      payload: { method: 'site.describe', params: {} },
    })
    expect(sent.requestId).toBeTruthy()

    conn.pending.settle(sent.requestId, { siteId: 's1', name: 'Box' })
    await expect(answer).resolves.toEqual({ siteId: 's1', name: 'Box' })
  })
})

describe('asking a site a question @SC-296', () => {
  it('fails immediately when the site is not connected', async () => {
    await expect(registry.request('nope', 'site.describe', {}))
      .rejects.toMatchObject({ code: 'offline' })
  })

  it('fails an in-flight request when the connection drops', async () => {
    const ws = fakeSocket()
    await registry.add('s1', ws as never)
    const answer = registry.request('s1', 'site.describe', {}, 60_000)
    await registry.remove('s1', ws as never)
    await expect(answer).rejects.toMatchObject({ code: 'disconnected' })
  })
})

describe('revoke', () => {
  it('sends the revoke frame, closes the socket, and forgets the connection', async () => {
    const ws = fakeSocket()
    await registry.add('s1', ws as never)

    registry.revoke('s1')

    expect(ws.sent.map((raw) => JSON.parse(raw))).toContainEqual({
      version: SITE_PROTOCOL_VERSION, type: 'revoke', siteId: 's1', payload: {},
    })
    expect(ws.closed).toBe(4001)
    expect(registry.isOnline('s1')).toBe(false)
  })

  it('sends the revoke frame before it closes the socket', async () => {
    const ws = fakeSocket()
    let sentAtClose: string[] = []
    const close = ws.close.bind(ws)
    ws.close = (code: number) => { sentAtClose = [...ws.sent]; close(code) }
    await registry.add('s1', ws as never)

    registry.revoke('s1')

    expect(sentAtClose.map((raw) => JSON.parse(raw).type)).toContain('revoke')
  })

  it('fails any request still in flight', async () => {
    const ws = fakeSocket()
    await registry.add('s1', ws as never)
    const pending = registry.request('s1', 'site.describe', {})

    registry.revoke('s1')

    await expect(pending).rejects.toThrow()
  })

  it('leaves the closed socket nothing to clear, so the row is never marked offline', async () => {
    const ws = fakeSocket()
    await registry.add('s1', ws as never)

    registry.revoke('s1')
    await registry.remove('s1', ws as never)

    expect(store.calls).not.toContain('offline:s1')
  })

  it('does nothing for a site that is not connected', () => {
    expect(() => registry.revoke('nobody')).not.toThrow()
  })
})

describe('closeForRotation — R-132', () => {
  it('closes the open socket so the site reconnects with its new credential', async () => {
    const ws = fakeSocket()
    await registry.add('s1', ws as never)

    registry.closeForRotation('s1')

    expect(ws.closed).toBe(4002)
  })

  it('leaves the entry to the socket\'s own close event, so the row goes offline until the site is back', async () => {
    const ws = fakeSocket()
    await registry.add('s1', ws as never)

    registry.closeForRotation('s1')
    expect(registry.isOnline('s1')).toBe(true)
    await registry.remove('s1', ws as never)

    expect(registry.isOnline('s1')).toBe(false)
    expect(store.calls).toContain('offline:s1')
  })

  it('sends no revoke frame, so the site keeps reconnecting', async () => {
    const ws = fakeSocket()
    await registry.add('s1', ws as never)
    registry.closeForRotation('s1')
    expect(ws.sent).toEqual([])
  })

  it('closes only the connection it was told about, not one that has replaced it', async () => {
    const before = fakeSocket()
    const conn = await registry.add('s1', before as never)
    const after = fakeSocket()
    await registry.add('s1', after as never)
    before.closed = null

    registry.closeForRotation('s1', conn)

    expect(after.closed).toBeNull()
  })

  it('does nothing for a site that is not connected', () => {
    expect(() => registry.closeForRotation('nobody')).not.toThrow()
  })
})

describe("the organisation's switches on every request (adr-0172, site protocol 1.12)", () => {
  const switchesSource = (fresh: Record<string, boolean> | null, read: Record<string, boolean> = {}) => ({
    fresh: () => fresh,
    read: async () => read,
  })

  it('sends the switches at once when they are fresh', async () => {
    const reg = new SiteChannelRegistry(store, switchesSource({ marketplace: true }))
    const ws = fakeSocket()
    await reg.add('s1', ws as never)
    reg.request('s1', 'site.describe', {}, 50).catch(() => {})
    expect(JSON.parse(ws.sent[0]).payload).toEqual({ method: 'site.describe', params: {}, features: { marketplace: true } })
  })

  it('reads them first when they are not', async () => {
    const reg = new SiteChannelRegistry(store, switchesSource(null, { usageBilling: false }))
    const ws = fakeSocket()
    await reg.add('s1', ws as never)
    reg.request('s1', 'site.describe', {}, 50).catch(() => {})
    await vi.waitFor(() => expect(ws.sent).toHaveLength(1))
    expect(JSON.parse(ws.sent[0]).payload.features).toEqual({ usageBilling: false })
  })

  it('sends none to a site speaking a protocol before 1.12', async () => {
    const reg = new SiteChannelRegistry(store, switchesSource({ marketplace: true }))
    const ws = fakeSocket()
    await reg.add('s1', ws as never, { major: 1, minor: 11 })
    reg.request('s1', 'site.describe', {}, 50).catch(() => {})
    expect(JSON.parse(ws.sent[0]).payload).toEqual({ method: 'site.describe', params: {} })
  })

  it('fails as offline when the site went away while the switches were read', async () => {
    let release: (v: Record<string, boolean>) => void = () => {}
    const reg = new SiteChannelRegistry(store, { fresh: () => null, read: () => new Promise(r => { release = r }) })
    const ws = fakeSocket()
    await reg.add('s1', ws as never)
    const answer = reg.request('s1', 'site.describe', {})
    await reg.remove('s1', ws as never)
    release({})
    await expect(answer).rejects.toMatchObject({ code: 'offline' })
    expect(ws.sent).toHaveLength(0)
  })
})
