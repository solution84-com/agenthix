import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))

import { nextBuiltInVersion } from '../install'

describe("a built-in's next version when hq's image changes it", () => {
  it('starts at 1.0.0', () => {
    expect(nextBuiltInVersion([])).toBe('1.0.0')
  })

  it('is one major past the highest held, whatever order they are in', () => {
    expect(nextBuiltInVersion(['1.0.0', '3.0.0', '2.0.0'])).toBe('4.0.0')
    expect(nextBuiltInVersion(['2.1.0', '10.0.0', '9.0.0'])).toBe('11.0.0')
  })
})
