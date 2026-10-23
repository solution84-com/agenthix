// @vitest-environment jsdom
/** The admin area is a second frame: its menu for the navigation, no docked conversation, the dock kept mounted. */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('../../components/AppSidebar', () => ({ AppSidebar: () => <nav data-testid="main-nav" /> }))
vi.mock('../../../pins/components/PinnedFoot', () => ({ PinnedFoot: () => null }))
vi.mock('../../../admin/components/AdminSidebar', () => ({ AdminSidebar: () => <nav data-testid="admin-menu" /> }))
vi.mock('../../../admin/components/AdminGate', () => ({ AdminGate: ({ children }: { children: React.ReactNode }) => <div data-testid="gate">{children}</div> }))
vi.mock('../MobileHeader', () => ({ MobileHeader: () => null }))
vi.mock('../ScreenBar', async (importOriginal) => ({ ...(await importOriginal<object>()), ScreenBar: () => null }))
vi.mock('../ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../VoiceBar', () => ({ VoiceBar: () => null }))

import { ShellFrame } from '../ShellFrame'
import { NavDrawerProvider } from '../../context/NavDrawerContext'

const show = (at: string, framed: boolean) => render(
  <MemoryRouter initialEntries={[at]}>
    <NavDrawerProvider>
      <ShellFrame framed={framed} breadcrumbs={[]} dock={<aside data-testid="dock" />}><p>the page</p></ShellFrame>
    </NavDrawerProvider>
  </MemoryRouter>,
)
afterEach(cleanup)

describe('the admin frame', () => {
  it('draws its menu, not the main navigation, behind the role check, with the dock hidden but mounted', () => {
    show('/admin/people', true)
    expect(screen.getByTestId('admin-menu')).toBeTruthy()
    expect(screen.queryByTestId('main-nav')).toBeNull()
    expect(screen.getByTestId('gate').textContent).toBe('the page')
    expect(screen.getByTestId('dock').parentElement?.className).toBe('hidden')
  })

  it('is drawn even before a page has published its parts', () => {
    show('/admin', false)
    expect(screen.getByTestId('admin-menu')).toBeTruthy()
    expect(screen.getByTestId('gate')).toBeTruthy()
  })

  it('leaves every other address on the main navigation with the dock showing', () => {
    show('/org', true)
    expect(screen.getByTestId('main-nav')).toBeTruthy()
    expect(screen.queryByTestId('admin-menu')).toBeNull()
    expect(screen.queryByTestId('gate')).toBeNull()
    expect(screen.getByTestId('dock').parentElement?.className).toBe('contents')
  })
})
