// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNavCollapsed } from '../useNavCollapsed'

beforeEach(() => localStorage.clear())

describe('useNavCollapsed @SC-151', () => {
  it('starts expanded', () => {
    const { result } = renderHook(() => useNavCollapsed())
    expect(result.current[0]).toBe(false)
  })

  it('remembers the choice for the next page', () => {
    const first = renderHook(() => useNavCollapsed())
    act(() => first.result.current[1]())
    expect(first.result.current[0]).toBe(true)
    first.unmount()

    const next = renderHook(() => useNavCollapsed())
    expect(next.result.current[0]).toBe(true)
    act(() => next.result.current[1]())
    expect(next.result.current[0]).toBe(false)
    expect(localStorage.getItem('navCollapsed')).toBe('0')
  })
})
