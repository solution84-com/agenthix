import { describe, it, expect, beforeEach, vi } from 'vitest'

// The invitation and reset-link budget with the counter kept in memory, one step at a time as the database's
// single statements are: attempts sent at once are each counted before any of them is checked.

const counts = vi.hoisted(() => new Map<string, number>())

vi.mock('../../server/rateLimit', () => ({
  consumeRateLimit: async (key: string, rule: { max: number }) => {
    await Promise.resolve()
    const n = (counts.get(key) ?? 0) + 1
    counts.set(key, n)
    return n <= rule.max
  },
  giveBackRateLimit: async (key: string) => {
    const n = counts.get(key) ?? 0
    if (n > 0) counts.set(key, n - 1)
  },
  isRateLimited: async () => false,
}))

import { attemptInviteCode, RATE_LIMIT_MAX } from '../inviteLimit'

const refusal = { status: 404 }
const slowRefusal = vi.fn(async () => { await new Promise(r => setTimeout(r, 5)); return refusal })

beforeEach(() => { counts.clear(); slowRefusal.mockClear() })

describe('attempts on a code are counted before they are checked (F-hq-1-04)', () => {
  it(`checks at most ${RATE_LIMIT_MAX} of many wrong codes sent at once`, async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () => attemptInviteCode('1.1.1.1', slowRefusal, r => r.status === 404)),
    )
    expect(slowRefusal.mock.calls.length).toBeLessThanOrEqual(RATE_LIMIT_MAX)
    expect(results.filter(r => r.limited)).toHaveLength(50 - RATE_LIMIT_MAX)
  })

  it('gives the count back for a code that works or a form problem, so using it often spends nothing', async () => {
    for (let i = 0; i < RATE_LIMIT_MAX * 2; i++) {
      expect(await attemptInviteCode('1.1.1.1', async () => ({ status: 200 }), r => r.status === 404)).toEqual({ limited: false, result: { status: 200 } })
    }
    expect(await attemptInviteCode('1.1.1.1', async () => refusal, r => r.status === 404)).toMatchObject({ limited: false })
  })

  it('gives the count back when the check itself fails, and passes the failure on', async () => {
    for (let i = 0; i < RATE_LIMIT_MAX * 2; i++) {
      await expect(attemptInviteCode('1.1.1.1', async () => { throw new Error('db down') }, () => true)).rejects.toThrow('db down')
    }
    expect(counts.get('1.1.1.1')).toBe(0)
  })

  it('keeps each address apart', async () => {
    for (let i = 0; i < RATE_LIMIT_MAX + 1; i++) await attemptInviteCode('1.1.1.1', async () => refusal, () => true)
    expect(await attemptInviteCode('2.2.2.2', async () => refusal, () => true)).toMatchObject({ limited: false })
  })
})
