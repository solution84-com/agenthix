// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUseQuery = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery: mockUseQuery,
  getUserSettings: 'getUserSettings',
}))

import { useIsAdmin, ONLY_ADMIN_SHAPES_AGENTS } from '../useIsAdmin'

describe('useIsAdmin (R-195)', () => {
  it.each([
    ['MEMBER', false],
    ['ADMIN', true],
  ])('%s -> %s', (role, expected) => {
    mockUseQuery.mockReturnValue({ data: { role } })
    expect(renderHook(() => useIsAdmin()).result.current).toBe(expected)
  })

  it('leaves the controls enabled until the role has loaded', () => {
    mockUseQuery.mockReturnValue({ data: undefined })
    expect(renderHook(() => useIsAdmin()).result.current).toBe(true)
  })

  it('names the role needed in its explanation', () => {
    expect(ONLY_ADMIN_SHAPES_AGENTS).toContain('ADMIN')
  })
})
