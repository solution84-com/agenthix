// @vitest-environment jsdom
/** Remove team: a failed read of the teams says so with Try again, not "Loading…" for ever. */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('wasp/client/operations', () => ({
  getProjectTeams: 'getProjectTeams', getProjectAgents: 'getProjectAgents', removeTeamFromProject: 'removeTeamFromProject',
  useQuery: (op: string) => (op === 'getProjectTeams'
    ? { data: undefined, isLoading: false, error: new Error('down'), dataUpdatedAt: 0, refetch: vi.fn() }
    : { data: undefined }),
  useAction: () => vi.fn(),
}))
vi.mock('../../people/useProjectPeopleView', () => ({ useProjectPeopleView: () => ({ view: undefined }) }))

import { RemoveTeamScreen } from '../RemoveTeamScreen'

beforeEach(() => cleanup())

describe('Remove team when the teams cannot be read @SC-1935', () => {
  it('shows the failure with Try again in place of Loading…', () => {
    render(<RemoveTeamScreen projectId="p1" teamId="t1" onCancel={vi.fn()} onDone={vi.fn()} />)
    expect(screen.getByText('The team could not be read')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('Loading…')).toBeNull()
  })
})
