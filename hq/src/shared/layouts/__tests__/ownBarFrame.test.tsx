// @vitest-environment jsdom
/** A screen that draws its own top bar (the workspace view): the rail stays, the screen bar is left out. */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('../../components/AppSidebar', () => ({ AppSidebar: () => <nav data-testid="main-nav" /> }))
vi.mock('../MobileHeader', () => ({ MobileHeader: () => <header data-testid="mobile-header" /> }))
vi.mock('../ScreenBar', async (importOriginal) => ({ ...(await importOriginal<object>()), ScreenBar: () => <div data-testid="screen-bar" /> }))
vi.mock('../ShellPanelHost', () => ({ ShellPanelHost: () => <div data-testid="panel-host" /> }))
vi.mock('../ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../VoiceBar', () => ({ VoiceBar: () => null }))

import { ShellFrame } from '../ShellFrame'
import { NavDrawerProvider } from '../../context/NavDrawerContext'

const show = (ownBar: boolean) => render(
  <MemoryRouter initialEntries={['/workspaces/w1/view']}>
    <NavDrawerProvider>
      <ShellFrame framed ownBar={ownBar} breadcrumbs={[{ label: 'website-code' }]} dock={<aside data-testid="dock" />}><p>the view</p></ShellFrame>
    </NavDrawerProvider>
  </MemoryRouter>,
)
afterEach(cleanup)

describe('a screen with its own top bar', () => {
  it('keeps the rail, the panels and the dock, and leaves out the screen bar', () => {
    show(true)
    expect(screen.getByText('the view')).toBeTruthy()
    expect(screen.getByTestId('main-nav')).toBeTruthy()
    expect(screen.getByTestId('panel-host')).toBeTruthy()
    expect(screen.getByTestId('dock')).toBeTruthy()
    expect(screen.queryByTestId('screen-bar')).toBeNull()
    expect(document.title).toContain('website-code')
  })

  it('an ordinary screen has the screen bar too', () => {
    show(false)
    expect(screen.getByTestId('main-nav')).toBeTruthy()
    expect(screen.getByTestId('screen-bar')).toBeTruthy()
  })
})
