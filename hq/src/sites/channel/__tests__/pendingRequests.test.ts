import { describe, it, expect } from 'vitest'
import { PendingRequests, ChannelRequestFailed } from '../pendingRequests'

describe('PendingRequests @SC-295', () => {
  it('resolves the request its reply names', async () => {
    const p = new PendingRequests()
    const a = p.next(1000)
    const b = p.next(1000)
    expect(a.requestId).not.toBe(b.requestId)

    p.settle(b.requestId, { name: 'second' })
    p.settle(a.requestId, { name: 'first' })

    await expect(a.promise).resolves.toEqual({ name: 'first' })
    await expect(b.promise).resolves.toEqual({ name: 'second' })
    expect(p.size).toBe(0)
  })

  it('rejects with the code the site sent back', async () => {
    const p = new PendingRequests()
    const { requestId, promise } = p.next(1000)
    p.fail(requestId, { message: 'Unknown method: nope', code: 'unknown_method' })
    await expect(promise).rejects.toMatchObject({ code: 'unknown_method' })
  })

  it('ignores a reply that names nothing in flight', () => {
    const p = new PendingRequests()
    expect(p.settle('99', {})).toBe(false)
    expect(p.fail('99', { message: 'x', code: 'y' })).toBe(false)
  })
})

describe('PendingRequests failure paths @SC-296', () => {
  it('times out rather than hanging', async () => {
    const p = new PendingRequests()
    const { promise } = p.next(10)
    await expect(promise).rejects.toBeInstanceOf(ChannelRequestFailed)
    await expect(promise).rejects.toMatchObject({ code: 'timeout' })
    expect(p.size).toBe(0)
  })

  it('fails everything in flight when the connection goes', async () => {
    // Without this, a dropped socket leaves every caller waiting out its own
    // timeout — which the chat relay would surface as a hung conversation long
    // after hq already knew the site was gone.
    const p = new PendingRequests()
    const a = p.next(60_000)
    const b = p.next(60_000)
    p.rejectAll('Connection closed')
    await expect(a.promise).rejects.toMatchObject({ code: 'disconnected' })
    await expect(b.promise).rejects.toMatchObject({ code: 'disconnected' })
    expect(p.size).toBe(0)
  })
})
