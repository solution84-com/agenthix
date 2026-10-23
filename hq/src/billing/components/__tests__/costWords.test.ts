import { describe, expect, it } from 'vitest'
import { callsWords, moneyOf, monthWords, shiftMonth } from '../costWords'

describe('cost words @SC-1218', () => {
  it('writes millionths as money, with small amounts kept visible', () => {
    expect(moneyOf(41_200_000, 'USD')).toBe('$41.20')
    expect(moneyOf(1_200, 'USD')).toBe('$0.0012')
    expect(moneyOf(0, 'EUR')).toBe('€0.00')
  })
  it('names months and steps across a year', () => {
    expect(monthWords('2026-10')).toBe('October 2026')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
  it('counts calls', () => {
    expect(callsWords(1)).toBe('1 call')
    expect(callsWords(1200)).toBe('1,200 calls')
  })
})
