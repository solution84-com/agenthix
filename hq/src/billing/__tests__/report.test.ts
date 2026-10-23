import { describe, expect, it } from 'vitest'
import { csvCell, csvLine, microsToDecimal } from '../csv'
import { groupRows, wireMicros } from '../report'

const raw = (over: Record<string, unknown>) => ({
  billingProfileId: 'bp-1', key: null, currency: 'USD', basis: 'ESTIMATED', amount: '1500', calls: 2n,
  inputTokens: 10n, outputTokens: 5n, cacheReadTokens: 0n, cacheWriteTokens: 0n, audioMs: 0n, characters: 0n, ...over,
}) as Parameters<typeof groupRows>[0][number]

const names = {
  profile: new Map([['bp-1', 'Fernhill'], ['bp-2', 'Client X']]),
  key: new Map([['u-1', 'Sam'], ['u-erased', 'Former member']]),
}

describe('the usage report', () => {
  it('keeps each currency and basis a separate total under one row', () => {
    const rows = groupRows([
      raw({ basis: 'ACTUAL', amount: '20000' }),
      raw({ basis: 'ESTIMATED' }),
      raw({ basis: 'UNPRICED', amount: null, currency: null }),
      raw({ billingProfileId: 'bp-2', currency: 'EUR' }),
    ], 'profile', names)
    expect(rows.map(r => [r.billingProfileName, r.totals.map(t => `${t.basis}:${t.currency}:${t.amountMicros}`)])).toEqual([
      ['Fernhill', ['ACTUAL:USD:20000', 'ESTIMATED:USD:1500', 'UNPRICED:null:null']],
      ['Client X', ['ESTIMATED:EUR:1500']],
    ])
  })

  it('names a person by their name, an erased person Former member, and calls with none apart', () => {
    const rows = groupRows([raw({ key: 'u-1' }), raw({ key: 'u-erased' }), raw({ key: 'u-gone' }), raw({ key: null })], 'person', names)
    expect(rows.map(r => r.name)).toEqual(['Sam', 'Former member', 'Former member', 'No person'])
  })

  it('reports millionths exactly, and refuses a total it cannot carry exactly', () => {
    expect(wireMicros('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER)
    expect(wireMicros(null)).toBeNull()
    expect(() => wireMicros('9007199254740993')).toThrow(/too large/)
  })
})

describe('the export', () => {
  it('writes millionths as an exact decimal', () => {
    expect(microsToDecimal(4_500_000n)).toBe('4.500000')
    expect(microsToDecimal(-1_500n)).toBe('-0.001500')
    expect(microsToDecimal(0n)).toBe('0.000000')
  })

  it('quotes what needs quoting, and keeps a name from being read as a formula', () => {
    expect(csvCell('Client X, Ltd')).toBe('"Client X, Ltd"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell(-5)).toBe('-5')
    expect(csvCell(null)).toBe('')
    expect(csvLine(['a', 1, null])).toBe('a,1,\r\n')
  })
})
