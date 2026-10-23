// @vitest-environment jsdom
/** Every /admin page checks the role before drawing: a member gets who to ask, and nothing under the gate is drawn. */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ settings: { data: undefined, isLoading: true } as { data: { role: string } | undefined; isLoading: boolean }, drawn: vi.fn() }))
vi.mock('wasp/client/operations', () => ({ useQuery: () => ops.settings, getUserSettings: 'getUserSettings' }))

import { AdminGate, ADMIN_REFUSAL } from '../components/AdminGate'

function Page() {
  ops.drawn()
  return <p>the page</p>
}
const show = () => render(<MemoryRouter><AdminGate><Page /></AdminGate></MemoryRouter>)
const role = (r: string | undefined) => { ops.settings = r ? { data: { role: r }, isLoading: false } : { data: undefined, isLoading: true } }

afterEach(() => { cleanup(); ops.drawn.mockClear() })

describe('the admin area route guard @SC-1188', () => {
  it('draws the page for an admin', () => {
    role('ADMIN')
    show()
    expect(screen.getByText('the page')).toBeTruthy()
  })

  it('tells a member who to ask and never draws the page', () => {
    role('MEMBER')
    show()
    expect(screen.getByRole('alert').textContent).toContain(ADMIN_REFUSAL)
    expect(screen.getByRole('link', { name: /organisation's page/ }).getAttribute('href')).toBe('/org')
    expect(ops.drawn).not.toHaveBeenCalled()
  })

  it('draws nothing of the page while the role is not known', () => {
    role(undefined)
    show()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(ops.drawn).not.toHaveBeenCalled()
  })
})
