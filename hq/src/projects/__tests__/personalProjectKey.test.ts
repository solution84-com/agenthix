import { describe, it, expect } from 'vitest'
import { derivePersonalProjectKey } from '../personalProjectKey'

describe('derivePersonalProjectKey', () => {
  it('uses the name’s own key when it is free', () => {
    expect(derivePersonalProjectKey('Tax return 2026', [])).toBe('TR')
  })

  it('never returns a key with a digit, even when the derived key is taken', () => {
    const key = derivePersonalProjectKey('Side research', ['SR'])
    expect(key).toMatch(/^[A-Z]{2,6}$/)
    expect(key.startsWith('SI')).toBe(true)
    expect(key).not.toBe('SR')
  })

  it('stays unique across many projects of the same name', () => {
    const keys: string[] = []
    for (let i = 0; i < 50; i++) keys.push(derivePersonalProjectKey('Side research', keys))
    expect(new Set(keys).size).toBe(50)
    for (const k of keys) expect(k).toMatch(/^[A-Z]{2,6}$/)
  })

  it('copes with a name that has no letters', () => {
    expect(derivePersonalProjectKey('2026', ['PROJ'])).toMatch(/^[A-Z]{2,6}$/)
  })

  it('skips a random key that is taken', () => {
    const seq = [0, 0, 1, 1]
    let i = 0
    const key = derivePersonalProjectKey('Side research', ['SR', 'SIAA'], () => seq[i++ % seq.length])
    expect(key).toBe('SIBB')
  })
})
