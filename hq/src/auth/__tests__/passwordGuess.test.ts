import { describe, it, expect, beforeEach, vi } from 'vitest'

// The current-password budget with the counter kept in memory, one step at a time as the database's single
// statements are: guesses sent at once are each counted before any of them is checked.

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
}))

import { guessPassword, WRONG_PASSWORD_LIMIT } from '../passwordGuess'

const slowCheck = (right: boolean) => {
  const check = vi.fn(async () => { await new Promise(r => setTimeout(r, 5)); return right })
  return check
}

beforeEach(() => counts.clear())

describe('guessing the current password @SC-532', () => {
  it(`checks at most ${WRONG_PASSWORD_LIMIT} of many wrong guesses sent at once`, async () => {
    const check = slowCheck(false)
    const results = await Promise.all(Array.from({ length: 50 }, () => guessPassword('mia', check)))
    expect(check.mock.calls.length).toBeLessThanOrEqual(WRONG_PASSWORD_LIMIT)
    expect(results.filter(r => r === 'wrong')).toHaveLength(WRONG_PASSWORD_LIMIT)
    expect(results.filter(r => r === 'too-many')).toHaveLength(50 - WRONG_PASSWORD_LIMIT)
  })

  it('refuses even the right password once the budget is spent, without checking it', async () => {
    for (let i = 0; i < WRONG_PASSWORD_LIMIT; i++) expect(await guessPassword('mia', slowCheck(false))).toBe('wrong')
    const right = slowCheck(true)
    expect(await guessPassword('mia', right)).toBe('too-many')
    expect(right).not.toHaveBeenCalled()
  })

  it('gives a right password\'s count back, so using it often spends nothing', async () => {
    for (let i = 0; i < WRONG_PASSWORD_LIMIT * 2; i++) expect(await guessPassword('mia', slowCheck(true))).toBe('right')
    expect(await guessPassword('mia', slowCheck(false))).toBe('wrong')
  })

  it('keeps each person\'s budget apart', async () => {
    for (let i = 0; i < WRONG_PASSWORD_LIMIT; i++) await guessPassword('mia', slowCheck(false))
    expect(await guessPassword('sam', slowCheck(true))).toBe('right')
  })
})
