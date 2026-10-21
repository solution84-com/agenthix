// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { NavDrawerProvider, useNavDrawer } from '../NavDrawerContext'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <NavDrawerProvider>{children}</NavDrawerProvider>
)

describe('NavDrawerContext @SC-220', () => {
  it('opens, toggles, and closes', () => {
    const { result } = renderHook(() => useNavDrawer(), { wrapper })
    expect(result.current.open).toBe(false)
    act(() => result.current.openDrawer())
    expect(result.current.open).toBe(true)
    act(() => result.current.closeDrawer())
    expect(result.current.open).toBe(false)
    act(() => result.current.toggleDrawer())
    expect(result.current.open).toBe(true)
  })
})
