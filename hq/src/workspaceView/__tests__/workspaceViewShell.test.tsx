// @vitest-environment jsdom
/** The workspace view sits in the app's frame: the rail stays, the project's menu is not offered, no foot strip of its own. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const shellProps = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: undefined, error: null, refetch: vi.fn() }),
  getWorkspace: 'getWorkspace', getWorkspaceBranches: 'getWorkspaceBranches',
}))
vi.mock('../../storage/pages/filesToolData', () => ({ useWorkspaces: () => ({ workspaces: [] }) }))
vi.mock('../hooks/useWorkspaceLive', () => ({
  useWorkspaceLive: () => ({ changes: null, event: null }), useOnWorkspaceChange: () => {},
  WorkspaceChangesContext: React.createContext(null), WorkspaceEventContext: React.createContext(null),
}))
vi.mock('../../shared/layouts/AppShell', () => ({
  AppShell: (p: Record<string, unknown> & { children: React.ReactNode }) => { shellProps.value = p; return <div data-testid="app-shell">{p.children}</div> },
}))

import { WorkspaceViewPage } from '../pages/WorkspaceViewPage'

const show = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  return render(<MemoryRouter initialEntries={['/workspaces/w1/view']}><Routes><Route path="/workspaces/:workspaceId/view" element={<WorkspaceViewPage />} /></Routes></MemoryRouter>)
}
afterEach(cleanup)

describe('the workspace view in the app frame', () => {
  it('is drawn by the app shell with the rail: no place menu, and its own top bar in place of the screen bar', () => {
    show(1280)
    expect(screen.getByTestId('app-shell')).toBeTruthy()
    expect(shellProps.value.ownBar).toBe(true)
    expect(shellProps.value.placeNav).toBeUndefined()
    expect(shellProps.value.mobileHeader).toBeUndefined()
    expect(screen.queryByTestId('view-foot')).toBeNull()
  })

  it('on a phone the frame has its own header, so the shell draws none', () => {
    show(390)
    expect(shellProps.value.mobileHeader).toBeTruthy()
  })
})
