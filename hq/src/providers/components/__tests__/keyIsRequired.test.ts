import { describe, expect, it } from 'vitest'
import { keyIsRequired } from '../AddProviderDialog'

describe('keyIsRequired', () => {
  it('asks for a key from every vendor except a custom endpoint, which may run without one', () => {
    expect(keyIsRequired('openai')).toBe(true)
    expect(keyIsRequired('anthropic')).toBe(true)
    expect(keyIsRequired('openai_compatible')).toBe(false)
  })
})
