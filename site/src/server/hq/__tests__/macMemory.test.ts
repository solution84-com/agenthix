import { describe, expect, it } from 'vitest'
import { macAvailableBytes } from '../macMemory'

const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                5362.
Pages active:                            505180.
Pages inactive:                          495466.
Pages speculative:                         9607.
Pages throttled:                              0.
Pages wired down:                        162021.
Pages purgeable:                            699.
`

describe('macAvailableBytes @SC-1016', () => {
  it('counts free, inactive, speculative and purgeable pages as available, not free pages alone', () => {
    expect(macAvailableBytes(VM_STAT)).toBe((5362 + 495466 + 9607 + 699) * 16384)
  })

  it('answers null for output it cannot read', () => {
    expect(macAvailableBytes('')).toBeNull()
    expect(macAvailableBytes('Pages free: 12.')).toBeNull()
  })
})
