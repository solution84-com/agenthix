// @vitest-environment jsdom
/**
 * @SC-220 App root provides the nav-drawer context to every routed page.
 *
 * Regression guard. The nav drawer (opened by the TopAppBar hamburger) is
 * driven by NavDrawerContext. The provider lives at the App root so EVERY
 * shell — AppLayout, ProjectLayout, and any future layout — gets a working
 * context for free. When a layout renders without a provider above it,
 * useNavDrawer() silently falls back to a no-op default and the hamburger
 * does nothing (the ProjectLayout regression this guards against).
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

// The voice root provider is irrelevant here (and pull in sockets /
// queries) — stub them to pass-through so we exercise only NavDrawer.
vi.mock('../shared/components/sidebar/OrgSwitcher', () => ({ OrgSwitcher: () => null }))
vi.mock('../shared/providers/VoiceCallProvider', () => ({
  VoiceCallProvider: ({ children }: { children: React.ReactNode }) => children,
}))
// Reads the signed-in person; tested on its own in useReturnAfterSignIn.test.tsx.
vi.mock('../shared/hooks/useReturnAfterSignIn', () => ({ useReturnAfterSignIn: () => {} }))
// Reads the person's settings; tested on its own in useSyncBrowserTimezone.test.tsx.
vi.mock('../shared/hooks/useSyncBrowserTimezone', () => ({ useSyncBrowserTimezone: () => {} }))
// The dock opens the conversation last written in; tested on its own in dockFill.test.tsx.
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: undefined }) }))
vi.mock('wasp/client/operations', async (importOriginal) => ({ ...(await importOriginal<object>()), useQuery: () => ({ data: undefined }) }))

import { App } from '../App'
import { useNavDrawer } from '../shared/context/NavDrawerContext'

function DrawerProbe() {
  const { open, toggleDrawer } = useNavDrawer()
  return (
    <div>
      <span data-testid="drawer-state">{open ? 'open' : 'closed'}</span>
      <button onClick={toggleDrawer}>toggle</button>
    </div>
  )
}

describe('App root — nav drawer provider @SC-220', () => {
  it('provides a working NavDrawer context to routed pages (not the no-op default)', () => {
    // A data router, as the app runs in: the dock's guard needs one (useBlocker).
    const router = createMemoryRouter([{ element: <App />, children: [{ index: true, element: <DrawerProbe /> }] }], { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)

    expect(screen.getByTestId('drawer-state').textContent).toBe('closed')
    fireEvent.click(screen.getByText('toggle'))
    // If the provider were missing at the root, toggleDrawer would be the no-op
    // default from createContext and this would still read 'closed'.
    expect(screen.getByTestId('drawer-state').textContent).toBe('open')
  })
})
