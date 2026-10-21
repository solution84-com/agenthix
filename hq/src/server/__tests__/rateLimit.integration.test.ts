import { describe, it, expect, vi, afterEach } from 'vitest'
import { prisma } from '../../test/db'

// The durable fixed-window counter, against the real test database: each
// step is one statement, so simultaneous callers are counted by Postgres itself.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

import { consumeRateLimit, sweepExpiredRateLimits, RATE_LIMIT_SWEEP_INTERVAL_MS } from '../rateLimit'

afterEach(() => { vi.useRealTimers() })

const row = (ip: string) => prisma.rateLimit.findUnique({ where: { ip } })

describe('consumeRateLimit', () => {
  it("allows up to the rule's max within the window, then refuses", async () => {
    const rule = { max: 3, windowMs: 60_000 }
    const results: boolean[] = []
    for (let i = 0; i < 5; i++) results.push(await consumeRateLimit('k', rule))
    expect(results).toEqual([true, true, true, false, false])
  })

  it('counts each key separately', async () => {
    const rule = { max: 1, windowMs: 60_000 }
    expect(await consumeRateLimit('a', rule)).toBe(true)
    expect(await consumeRateLimit('b', rule)).toBe(true)
    expect(await consumeRateLimit('a', rule)).toBe(false)
  })

  it('starts a fresh window once the old one has passed', async () => {
    const rule = { max: 1, windowMs: 60_000 }
    expect(await consumeRateLimit('k', rule)).toBe(true)
    expect(await consumeRateLimit('k', rule)).toBe(false)
    await prisma.rateLimit.update({ where: { ip: 'k' }, data: { resetAt: new Date(Date.now() - 1) } })

    expect(await consumeRateLimit('k', rule)).toBe(true)
    expect((await row('k'))?.count).toBe(1)
    expect(await consumeRateLimit('k', rule)).toBe(false)
  })

  it('lets exactly max of many simultaneous callers through (no read-then-write race)', async () => {
    const rule = { max: 3, windowMs: 60_000 }
    const results = await Promise.all(Array.from({ length: 10 }, () => consumeRateLimit('burst', rule)))

    expect(results.filter(Boolean)).toHaveLength(3)
    expect((await row('burst'))?.count).toBe(10)
  })

  it('lets exactly max of many simultaneous callers through when the old window has just expired', async () => {
    const rule = { max: 2, windowMs: 60_000 }
    await prisma.rateLimit.create({ data: { ip: 'burst', count: 99, resetAt: new Date(Date.now() - 1) } })

    const results = await Promise.all(Array.from({ length: 8 }, () => consumeRateLimit('burst', rule)))

    expect(results.filter(Boolean)).toHaveLength(2)
  })
})

describe('expired rows are swept', () => {
  it('sweepExpiredRateLimits removes ended windows and keeps live ones', async () => {
    await prisma.rateLimit.createMany({
      data: [
        { ip: 'old', count: 5, resetAt: new Date(Date.now() - 1000) },
        { ip: 'live', count: 1, resetAt: new Date(Date.now() + 60_000) },
      ],
    })
    expect(await sweepExpiredRateLimits()).toBe(1)
    expect((await prisma.rateLimit.findMany()).map((r) => r.ip)).toEqual(['live'])
  })

  it('consumeRateLimit sweeps at most once per interval', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // Well past any earlier test's sweep, so the first call here is due one.
    vi.setSystemTime(new Date('2031-01-01T00:00:00Z'))
    const rule = { max: 5, windowMs: 1000 }
    const stale = (ip: string) => prisma.rateLimit.create({ data: { ip, count: 1, resetAt: new Date(Date.now() - 1) } })

    await stale('stale-1')
    await consumeRateLimit('k', rule)
    await vi.waitFor(async () => expect(await row('stale-1')).toBeNull())

    await stale('stale-2')
    vi.setSystemTime(new Date(Date.now() + RATE_LIMIT_SWEEP_INTERVAL_MS - 1000))
    await consumeRateLimit('k', rule)
    expect(await row('stale-2')).not.toBeNull()

    vi.setSystemTime(new Date(Date.now() + 2000))
    await consumeRateLimit('k', rule)
    await vi.waitFor(async () => expect(await row('stale-2')).toBeNull())
  })
})
