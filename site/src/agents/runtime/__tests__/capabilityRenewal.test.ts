import { describe, it, expect, vi, afterEach } from 'vitest'
import { startCapabilityRenewal, type CapabilityHolder } from '../capabilityRenewal'

const TTL_MS = 900_000 // 15 min

function makeHolder(): CapabilityHolder {
  return { jwt: 'jwt-0', expiresAt: Date.now() + TTL_MS }
}

afterEach(() => vi.useRealTimers())

describe('capability renewal scheduling @SC-273', () => {
  it('renews at 80% of TTL and updates the holder in place', async () => {
    vi.useFakeTimers()
    const holder = makeHolder()
    const renew = vi.fn().mockImplementation(async () => ({ capability: 'jwt-1', expiresAt: Date.now() + TTL_MS }))
    const handle = startCapabilityRenewal({ holder, renew })
    await vi.advanceTimersByTimeAsync(TTL_MS * 0.8 + 1000)
    expect(renew).toHaveBeenCalledTimes(1)
    expect(holder.jwt).toBe('jwt-1')
    handle.stop()
  })

  it('stop() prevents any further renewal', async () => {
    vi.useFakeTimers()
    const holder = makeHolder()
    const renew = vi.fn().mockImplementation(async () => ({ capability: 'jwt-1', expiresAt: Date.now() + TTL_MS }))
    const handle = startCapabilityRenewal({ holder, renew })
    handle.stop()
    await vi.advanceTimersByTimeAsync(TTL_MS * 2)
    expect(renew).not.toHaveBeenCalled()
  })
})

describe('a renewal that resolves after expiry is discarded @SC-274', () => {
  it('does not revive an expired holder with a late-arriving renewal', async () => {
    vi.useFakeTimers()
    const holder = makeHolder()
    let resolveRenew!: (v: { capability: string; expiresAt: number }) => void
    const renew = vi.fn().mockImplementation(() => new Promise<{ capability: string; expiresAt: number }>((resolve) => { resolveRenew = resolve }))
    const handle = startCapabilityRenewal({ holder, renew })
    await vi.advanceTimersByTimeAsync(TTL_MS * 0.8 + 1000) // fires the renew attempt; renew() is now in flight
    expect(renew).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(TTL_MS) // holder.expiresAt passes while renew is still pending
    resolveRenew({ capability: 'jwt-late', expiresAt: Date.now() + TTL_MS }) // arrives too late
    await vi.advanceTimersByTimeAsync(0) // let the awaited promise settle
    expect(holder.jwt).toBe('jwt-0') // discarded, not revived
    handle.stop()
  })
})

describe('renewal failure honours the current capability @SC-274', () => {
  it('keeps the old jwt, retries every 60s, and goes quiet after actual expiry', async () => {
    vi.useFakeTimers()
    const holder = makeHolder()
    const renew = vi.fn().mockRejectedValue(new Error('hq unreachable'))
    const handle = startCapabilityRenewal({ holder, renew })
    await vi.advanceTimersByTimeAsync(TTL_MS * 0.8 + 1000)  // first attempt fails
    expect(holder.jwt).toBe('jwt-0')                         // honoured, not dropped
    await vi.advanceTimersByTimeAsync(60_000 + 1000)         // retry
    expect(renew.mock.calls.length).toBeGreaterThanOrEqual(2)
    await vi.advanceTimersByTimeAsync(TTL_MS)                // past expiry
    const callsAtExpiry = renew.mock.calls.length
    await vi.advanceTimersByTimeAsync(300_000)
    expect(renew.mock.calls.length).toBe(callsAtExpiry)      // no retries after expiry
    handle.stop()
  })
})
