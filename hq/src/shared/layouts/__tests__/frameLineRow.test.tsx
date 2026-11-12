// @vitest-environment jsdom
/** The frame line's own row: the content and the file viewer start below it (live demo, usability finding 6). */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('../../components/AppSidebar', () => ({ AppSidebar: () => <nav data-testid="main-nav" /> }))
vi.mock('../MobileHeader', () => ({ MobileHeader: () => <header data-testid="mobile-header" /> }))
vi.mock('../ScreenBar', async (importOriginal) => ({ ...(await importOriginal<object>()), ScreenBar: () => <div data-testid="screen-bar" /> }))
vi.mock('../ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../../../storage/pages/viewer/FileViewerHost', () => ({ FileViewerHost: () => <section data-testid="file-viewer" className="absolute inset-0" /> }))

import { ShellFrame } from '../ShellFrame'
import { NavDrawerProvider } from '../../context/NavDrawerContext'

const show = (frameLine: string | null) => render(
  <MemoryRouter initialEntries={['/projects/WEB']}>
    <NavDrawerProvider>
      <ShellFrame framed frameLine={frameLine} frameLineLink={frameLine ? { href: 'https://example.com/guide/', label: 'About the demo' } : null} breadcrumbs={[{ label: 'Website relaunch' }]}>
        <p>the screen</p>
      </ShellFrame>
    </NavDrawerProvider>
  </MemoryRouter>,
)
afterEach(cleanup)

describe('the frame line and what is under it @SC-1975', () => {
  it('while it shows, the screen and the file viewer sit in a box below the line, which the viewer covers instead of the line', () => {
    show('Demo — shared with other visitors · resets in 2 h 44 min')
    const row = screen.getByTestId('frame-line-row')
    const content = screen.getByTestId('shell-content')
    expect(content.className).toContain('relative')
    expect(content.contains(screen.getByTestId('file-viewer'))).toBe(true)
    expect(content.contains(screen.getByText('the screen'))).toBe(true)
    expect(content.contains(row)).toBe(false)
    expect((row.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true)
    // The row has no fixed height: the line may wrap on a narrow screen and keep its link.
    expect(row.className).not.toMatch(/\bh-/)
    expect(screen.getByRole('link', { name: 'About the demo' })).toBeTruthy()
  })

  it('with no line (the setting off, HQ answering) the box is not drawn, so the viewer covers the screen as before', () => {
    show(null)
    expect(screen.queryByTestId('frame-line-row')).toBeNull()
    expect(screen.getByTestId('shell-content').className).toBe('contents')
  })

  it('the screen is not remounted when the line comes or goes', () => {
    const view = show(null)
    const before = screen.getByText('the screen')
    view.rerender(
      <MemoryRouter initialEntries={['/projects/WEB']}>
        <NavDrawerProvider>
          <ShellFrame framed frameLine="HQ is not answering. Trying again…" breadcrumbs={[{ label: 'Website relaunch' }]}><p>the screen</p></ShellFrame>
        </NavDrawerProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('the screen')).toBe(before)
  })
})
