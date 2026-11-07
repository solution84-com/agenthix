// @vitest-environment jsdom
/** The view's model asks for a branch's changes only while a branch is chosen, workspace events included. */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { BranchLineView, WorkspaceBranchesView } from '../../branches/views'

const refetchChanges = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: undefined, error: null, refetch: refetchChanges }),
  getBranchChanges: 'getBranchChanges', getMainVersionAt: 'getMainVersionAt', getMainVersionChanges: 'getMainVersionChanges',
}))

import { WorkspaceChangesContext } from '../hooks/useWorkspaceLive'
import { useWorkspaceViewModel } from '../hooks/useWorkspaceViewModel'

const line: BranchLineView = {
  id: 'b1', name: 'login-page', ahead: 1, behind: 0, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'conversation', conversationId: 'c1', title: 'Login page', personId: 'u1', personName: 'Mia' }, working: null,
}
const view: WorkspaceBranchesView = { git: true, canAct: true, main: { name: 'main', head: 'h1', versionCount: 1 }, branches: [line] }

function rendered(at: string) {
  let changes = 0
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[at]}>
      <WorkspaceChangesContext.Provider value={changes}>{children}</WorkspaceChangesContext.Provider>
    </MemoryRouter>
  )
  const hook = renderHook(() => useWorkspaceViewModel('w1', 'u1', view), { wrapper })
  return { bump: () => { changes += 1; hook.rerender() } }
}

beforeEach(() => {
  localStorage.clear()
  refetchChanges.mockClear()
})

describe('useWorkspaceViewModel @SC-1687', () => {
  it('with main chosen, a workspace event asks for no branch changes', () => {
    rendered('/workspaces/w1/view?branch=main').bump()
    expect(refetchChanges).not.toHaveBeenCalled()
  })

  it('with a branch chosen, a workspace event reads its changes again', () => {
    rendered('/workspaces/w1/view?branch=login-page').bump()
    expect(refetchChanges).toHaveBeenCalledTimes(1)
  })
})
