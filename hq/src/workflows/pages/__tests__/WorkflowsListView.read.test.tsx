// @vitest-environment jsdom
/** The Workflows list when its read fails: a nudge in place with nothing held, the list kept when old, never a dialog. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const read = vi.hoisted(() => ({ result: {} as Record<string, unknown>, refetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string) => (op === 'getPlaceWorkflows' ? read.result : { data: [] }),
  useAction: () => vi.fn(),
  getPlaceWorkflows: 'getPlaceWorkflows', getWorkflowRuns: 'getWorkflowRuns', getWorkflow: 'getWorkflow', switchWorkflow: 'switchWorkflow',
  startWorkflowRun: 'startWorkflowRun', getAgents: 'getAgents', getProjectMembers: 'getProjectMembers',
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('../../../storage/pages/filesToolData', () => ({ useWorkspaces: () => ({ workspaces: [] }) }))

import { WorkflowsListView } from '../WorkflowsListView'

const place = { type: 'project' as const, id: 'p1' }
const props = { place, onOpen: vi.fn(), onReview: vi.fn(), onRunStarted: vi.fn() }
const held = { mayAdminister: false, mayRun: false, workflows: [] }

beforeEach(() => { read.refetch.mockClear() })
afterEach(cleanup)

describe('the Workflows list when its read fails @SC-1929', () => {
  it('says so in place of the list, as a status, with Try again', () => {
    read.result = { data: undefined, isLoading: false, error: new Error('down'), dataUpdatedAt: 0, refetch: read.refetch }
    render(<WorkflowsListView {...props} />)
    expect(screen.getByRole('status').textContent).toContain('The workflows could not be read')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('No workflows yet')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(read.refetch).toHaveBeenCalled()
  })

  it('says nothing while the list on screen is fresh', () => {
    read.result = { data: held, isLoading: false, error: new Error('down'), dataUpdatedAt: Date.now(), refetch: read.refetch }
    render(<WorkflowsListView {...props} />)
    expect(screen.getByText('No workflows yet')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says "Not up to date" in the page, keeping the list, once it is old', () => {
    read.result = { data: held, isLoading: false, error: new Error('down'), dataUpdatedAt: Date.now() - 10 * 60_000, refetch: read.refetch }
    render(<WorkflowsListView {...props} />)
    expect(screen.getByText('No workflows yet')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Not up to date')
  })
})
