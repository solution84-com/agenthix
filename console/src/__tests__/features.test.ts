import { afterEach, describe, expect, it, vi } from 'vitest'
import { HqFeatures, parseFeaturesOn } from '../hq/hqFeatures'
import { requireFeature } from '../http/routes/features'
import { startHarness, type Harness } from './harness'

// The Fleet Console shows a flagged feature's section only when hq says it is on (adr-0172).

let h: Harness | null = null
afterEach(async () => { await h?.close(); h = null })

describe("hq's answer of which features are on @SC-1777", () => {
  it('keeps only the flags this Fleet Console knows', () => {
    expect(parseFeaturesOn({ on: ['usageBilling', 'notAFlag', 3, 'usageBilling'] })).toEqual(['usageBilling'])
    expect(parseFeaturesOn({ on: 'usageBilling' })).toEqual([])
    expect(parseFeaturesOn(null)).toEqual([])
  })

  it('is none while hq is not asked, does not answer, or refuses', async () => {
    const link = { state: 'connected' } as never
    expect(await new HqFeatures(link, null).on()).toEqual([])
    expect(await new HqFeatures({ state: 'disconnected' } as never, async () => ({ on: ['usageBilling'] })).on()).toEqual([])
    expect(await new HqFeatures(link, async () => { throw new Error('unknown_method') }).on()).toEqual([])
  })

  it('is kept briefly, then asked again', async () => {
    let now = 0
    const ask = vi.fn(async () => ({ on: ['usageBilling'] }))
    const features = new HqFeatures({ state: 'connected' } as never, ask, () => now)
    expect(await features.isOn('usageBilling')).toBe(true)
    await features.on()
    expect(ask).toHaveBeenCalledTimes(1)
    now = 11_000
    ask.mockResolvedValueOnce({ on: [] })
    expect(await features.isOn('usageBilling')).toBe(false)
    expect(ask).toHaveBeenCalledTimes(2)
  })
})

describe('the screens and the guard @SC-1777', () => {
  it('tells a signed-in screen which features are on, and nobody else', async () => {
    h = await startHarness({ askFeatures: async () => ({ on: ['marketplace'] }) })
    expect((await h.request('/api/features')).status).toBe(401)
    const auth = await h.signIn()
    expect((await h.request('/api/features', auth)).json).toEqual({ on: ['marketplace'] })
  })

  it('says none is on when hq is not asked', async () => {
    h = await startHarness()
    const auth = await h.signIn()
    expect((await h.request('/api/features', auth)).json).toEqual({ on: [] })
  })

  it("refuses a flagged route while the feature is off, never reaching its handler", async () => {
    h = await startHarness({ askFeatures: async () => ({ on: [] }) })
    const guard = requireFeature(h.ctx, 'usageBilling')
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()
    await guard({} as never, res as never, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/Nothing was changed\.$/) }))
  })

  it('lets a flagged route through while hq says the feature is on', async () => {
    h = await startHarness({ askFeatures: async () => ({ on: ['usageBilling'] }) })
    const next = vi.fn()
    await requireFeature(h.ctx, 'usageBilling')({} as never, {} as never, next)
    expect(next).toHaveBeenCalled()
  })
})
