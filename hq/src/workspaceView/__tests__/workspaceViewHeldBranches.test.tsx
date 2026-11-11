// @vitest-environment jsdom
/** The workspace view's branches, read again on every event: a failed re-read over the view says so, in the view. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const branches = vi.hoisted(() => ({ value: {} as { data?: unknown; error?: Error | null } }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (name: string) => name === 'getWorkspace'
    ? { data: { id: 'w1', name: 'site', ownerType: 'user', ownerId: 'u1' }, error: null, refetch: vi.fn() }
    : { data: branches.value.data, error: branches.value.error ?? null, dataUpdatedAt: Date.now(), refetch: vi.fn() },
  getWorkspace: 'getWorkspace', getWorkspaceBranches: 'getWorkspaceBranches',
}))
vi.mock('../../storage/pages/filesToolData', () => ({ useWorkspaces: () => ({ workspaces: [] }) }))
vi.mock('../../dock/startPlace', async () => ({ ...(await vi.importActual<object>('../../dock/startPlace')), chatPlaceOf: () => ({ kind: 'user' }), placeOf: () => ({ href: '/', label: 'Home' }) }))
vi.mock('../hooks/useWorkspaceLive', () => ({
  useWorkspaceLive: () => ({ changes: null, event: null }), useOnWorkspaceChange: () => {},
  WorkspaceChangesContext: React.createContext(null), WorkspaceEventContext: React.createContext(null),
}))
vi.mock('../../shared/layouts/AppShell', () => ({ AppShell: (p: { children: React.ReactNode }) => <div>{p.children}</div> }))
vi.mock('../components/WorkspaceViewBody', () => ({ WorkspaceViewBody: () => <div>the view</div> }))

import { WorkspaceViewPage } from '../pages/WorkspaceViewPage'

const silent = Object.assign(new Error('Execution Site "Laptop" is unreachable'), { statusCode: 503 })
const view = { git: true, canAct: true, main: { name: 'main', head: 'h1', versionCount: 1 }, branches: [] }
const show = () => render(<MemoryRouter initialEntries={['/workspaces/w1/view']}><Routes><Route path="/workspaces/:workspaceId/view" element={<WorkspaceViewPage />} /></Routes></MemoryRouter>)

afterEach(cleanup)

describe('WorkspaceViewPage, branches on a failed re-read @SC-1930', () => {
  it('keeps the view and says a silent site over it', () => {
    branches.value = { data: view, error: silent }
    show()
    expect(screen.getByText('the view')).toBeTruthy()
    expect(screen.getByTestId('branches-read-nudge').textContent).toContain('Laptop')
  })

  it('says nothing over the view while the re-read has not failed', () => {
    branches.value = { data: view }
    show()
    expect(screen.queryByTestId('branches-read-nudge')).toBeNull()
  })
})
