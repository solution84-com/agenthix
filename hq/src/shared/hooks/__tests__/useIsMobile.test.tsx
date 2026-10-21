// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from '../useIsMobile'

function setWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  window.dispatchEvent(new Event('resize'))
}

describe('useIsMobile @SC-219', () => {
  beforeEach(() => setWidth(1280))

  it('is false at >= 1024px and true below', () => {
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    act(() => setWidth(375))
    expect(result.current).toBe(true)
  })
})
