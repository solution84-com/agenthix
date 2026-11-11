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
vi.mock('../VoiceBar', () => ({ VoiceBar: () => <div data-testid="voice-bar"><button>Mute</button></div> }))

import { ShellFrame } from '../ShellFrame'
import { NavDrawerProvider } from '../../context/NavDrawerContext'

const show = (ownBar: boolean, frameLine: string | null = null) => render(
  <MemoryRouter initialEntries={['/workspaces/w1/view']}>
    <NavDrawerProvider>
      <ShellFrame framed ownBar={ownBar} frameLine={frameLine} breadcrumbs={[{ label: 'website-code' }]} dock={<aside data-testid="dock" />}><p>the view</p></ShellFrame>
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

describe('the frame line @SC-1932', () => {
  it('has no row while it says nothing', () => {
    show(false)
    expect(screen.queryByTestId('frame-line-row')).toBeNull()
  })

  it('takes a row of its own after the screen bar and the call bar, so it covers neither, nor the screen\'s own bar', () => {
    show(true, 'HQ is not answering. Trying again…')
    const row = screen.getByTestId('frame-line-row')
    expect(row.textContent).toContain('HQ is not answering')
    expect(screen.getByRole('status').textContent).toContain('HQ is not answering')
    const after = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect(after(screen.getByTestId('voice-bar'), row)).toBe(true)
    expect(after(row, screen.getByText('the view'))).toBe(true)
    expect(row.contains(screen.getByRole('button', { name: 'Mute' }))).toBe(false)
  })
})
