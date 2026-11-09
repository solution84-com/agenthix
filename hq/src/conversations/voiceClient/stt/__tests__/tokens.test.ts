import { describe, expect, it, vi } from 'vitest'
import { fakeClock } from '../../clock'
import { pacedMints, tokensAhead } from '../tokens'

describe('tokens for speech connections', () => {
  it('hands each token to one connection attempt only: the one fetched ahead, then a fresh one', async () => {
    const clock = fakeClock()
    let n = 0
    const tokens = tokensAhead(async () => `t${n++}`, clock)
    tokens.fetchAhead()
    expect(await tokens.take()).toBe('t0')
    expect(await tokens.take()).toBe('t1')
  })

  it('fetches no more than its share of the key’s minute; one past it waits until the minute has room', async () => {
    const clock = fakeClock()
    const fetch = vi.fn(async () => 'token')
    const mint = pacedMints(fetch, clock, 3)
    const got = [mint(), mint(), mint()]
    expect(fetch).toHaveBeenCalledTimes(3)
    clock.advance(10_000)
    const late = mint()
    expect(fetch).toHaveBeenCalledTimes(3)
    clock.advance(49_999)
    expect(fetch).toHaveBeenCalledTimes(3)
    clock.advance(1)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(await Promise.all([...got, late])).toEqual(['token', 'token', 'token', 'token'])
  })
})
