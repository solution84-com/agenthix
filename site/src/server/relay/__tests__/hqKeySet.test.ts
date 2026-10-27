import { describe, it, expect, vi } from 'vitest'
import type { JsonWebKeySet } from '@agenthix/core'

vi.mock('#db', () => ({ prisma: {} }))
const { createHqKeySet } = await import('../hqKeySet')

describe('hq key set for tickets @SC-1502', () => {
  it('fetches once and serves the cached set', async () => {
    const fetchSet = vi.fn(async (): Promise<JsonWebKeySet> => ({ keys: [] }))
    const keys = createHqKeySet(fetchSet, () => 1_000)
    await keys.get()
    await keys.get()
    expect(fetchSet).toHaveBeenCalledTimes(1)
  })

  it('refetches on request, but at most once per cooldown', async () => {
    let now = 0
    const fetchSet = vi.fn(async (): Promise<JsonWebKeySet> => ({ keys: [] }))
    const keys = createHqKeySet(fetchSet, () => now)
    await keys.get()
    now = 1_000
    expect(await keys.refresh()).toBe(false)
    now = 31_000
    expect(await keys.refresh()).toBe(true)
    expect(await keys.refresh()).toBe(false)
    expect(fetchSet).toHaveBeenCalledTimes(2)
  })

  it('fetches again once the cache is old', async () => {
    let now = 0
    const fetchSet = vi.fn(async (): Promise<JsonWebKeySet> => ({ keys: [] }))
    const keys = createHqKeySet(fetchSet, () => now)
    await keys.get()
    now = 11 * 60_000
    await keys.get()
    expect(fetchSet).toHaveBeenCalledTimes(2)
  })
})
