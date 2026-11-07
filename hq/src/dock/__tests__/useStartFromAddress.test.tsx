// @vitest-environment jsdom
/**
 * A list with no box of its own starts a new conversation with the agent its address names (`?agent=`), in the chat
 * panel, and goes back to the plain list.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

const h = vi.hoisted(() => ({ dock: null as null | { startNew: ReturnType<typeof vi.fn> } }))
vi.mock('../DockContext', () => ({ useDock: () => h.dock }))

import { useStartFromAddress } from '../useStartFromAddress'

function List() {
  useStartFromAddress({ kind: 'project', key: 'WEB' })
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}
const renderAt = (at: string) => render(<MemoryRouter initialEntries={[at]}><List /></MemoryRouter>)

beforeEach(() => { h.dock = { startNew: vi.fn() } })
afterEach(cleanup)

describe('a new conversation asked for in a list’s address', () => {
  it('starts it in the panel with that agent, in this place, and drops the agent from the address', () => {
    renderAt('/projects/WEB?agent=a1&c=c7')
    expect(h.dock!.startNew).toHaveBeenCalledTimes(1)
    expect(h.dock!.startNew).toHaveBeenCalledWith({ kind: 'project', key: 'WEB' }, 'a1')
    expect(screen.getByTestId('where').textContent).toBe('/projects/WEB?c=c7')
  })

  it('does nothing for a plain list', () => {
    renderAt('/projects/WEB')
    expect(h.dock!.startNew).not.toHaveBeenCalled()
  })

  it('leaves the address alone where there is no chat panel to start it in', () => {
    h.dock = null
    renderAt('/projects/WEB?agent=a1')
    expect(screen.getByTestId('where').textContent).toBe('/projects/WEB?agent=a1')
  })
})
