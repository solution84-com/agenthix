// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { useMarkedItem } from '../useMarkedItem'

const at = (url: string) => ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>

describe('useMarkedItem @SC-1010', () => {
  it('marks the item the address names, by the parameter the tool reads', () => {
    const { result } = renderHook(() => useMarkedItem('memory'), { wrapper: at('/chat?tool=memory&memory=short-answers') })
    expect(result.current.markOf('short-answers')).toMatchObject({ 'data-marked': 'true' })
    expect(result.current.markOf('short-answers').className).toContain('ring')
    expect(result.current.markOf('other')).toEqual({})
  })

  it('marks nothing when the address names no item, or names one for another tool', () => {
    const none = renderHook(() => useMarkedItem('run'), { wrapper: at('/chat?tool=runs') })
    expect(none.result.current.markOf('r1')).toEqual({})
    const other = renderHook(() => useMarkedItem('run'), { wrapper: at('/chat?tool=memory&memory=r1') })
    expect(other.result.current.markOf('r1')).toEqual({})
  })
})
