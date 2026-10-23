import { describe, expect, it } from 'vitest'
import { accentOf, regionOf } from '../voiceAccent'

describe('the accent from the language code', () => {
  it('names the region', () => {
    expect(accentOf('en-GB')).toBe('British')
    expect(accentOf('en_AU')).toBe('Australian')
    expect(accentOf('es-MX')).toBe('Mexican')
  })
  it('shows a region it has no name for by its code, and no region as nothing', () => {
    expect(accentOf('en-XX')).toBe('XX')
    expect(accentOf('vi')).toBe('')
    expect(regionOf('')).toBeNull()
  })
})
