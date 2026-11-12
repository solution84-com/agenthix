// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const data = vi.hoisted(() => ({ place: null as unknown, runs: [] as unknown[], detail: null as unknown, runsRead: 0 }))
const switchAction = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  getDemoInfo: 'getDemoInfo',
  useQuery: (op: string) => {
    if (op === 'getPlaceWorkflows') return { data: data.place, isLoading: false }
    if (op === 'getWorkflowRuns') { data.runsRead += 1; return { data: data.runs } }
    if (op === 'getWorkflow') return { data: data.detail }
    return { data: [] }
  },
  useAction: (op: string) => (op === 'switchWorkflow' ? switchAction : vi.fn()),
  getPlaceWorkflows: 'getPlaceWorkflows', getWorkflowRuns: 'getWorkflowRuns', getWorkflow: 'getWorkflow', switchWorkflow: 'switchWorkflow',
  startWorkflowRun: 'startWorkflowRun', getAgents: 'getAgents', getProjectMembers: 'getProjectMembers',
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('../../../storage/pages/filesToolData', () => ({ useWorkspaces: () => ({ workspaces: [] }) }))

import { WorkflowsListView } from '../WorkflowsListView'

const definition = (secrets: string[], parameters: unknown[] = []) => ({
  name: 'w', description: 'Build and ship', steps: [{ name: 'Build', run: 'make', secrets, timeoutSeconds: null }, { name: 'Ship', run: 'ship', secrets, timeoutSeconds: null }],
  variables: [], parameters, hosts: [], github: {}, timeoutSeconds: 600, files: [],
})
const workflow = (over: Record<string, unknown> = {}) => ({
  id: 'w1', name: 'deploy', description: 'Build and ship', enabled: true, approved: { number: 1, hash: 'h', definition: definition(['KEY']) }, waiting: [], lastRun: null, ...over,
})
const place = { type: 'project' as const, id: 'p1' }
const handlers = { onOpen: vi.fn(), onReview: vi.fn(), onRunStarted: vi.fn() }

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  data.runs = []
  data.runsRead = 0
  data.detail = { versions: [{ number: 2, origin: 'PROPOSED', proposedByAgentId: null, reviewLevel: 'LOW', checkSummary: 'Adds one step.', needsApprovalAgain: null }] }
})

describe('the Workflows section @SC-1290', () => {
  it('lists each workflow with its steps and secrets, and the switch shows its state', () => {
    data.place = { mayAdminister: true, mayRun: true, workflows: [workflow(), workflow({ id: 'w2', name: 'backup', enabled: false })] }
    render(<WorkflowsListView place={place} {...handlers} />)
    expect(screen.getAllByTestId('workflow-row')).toHaveLength(2)
    expect(screen.getAllByText(/2 steps · KEY/).length).toBeGreaterThan(0)
    const switches = screen.getAllByRole('switch')
    expect(switches.map((s) => s.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect((screen.getByRole('button', { name: 'Run backup' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('puts what waits for an administrator first, with Review', () => {
    data.place = { mayAdminister: true, mayRun: true, workflows: [workflow({ waiting: [{ number: 2, hash: 'h2', origin: 'PROPOSED', needsApprovalAgain: null, createdAt: new Date() }] })] }
    render(<WorkflowsListView place={place} {...handlers} />)
    expect(screen.getByTestId('needs-you-row').textContent).toContain('deploy · version 2')
    expect(screen.getByTestId('needs-you-row').textContent).toContain('Adds one step.')
    fireEvent.click(screen.getByRole('button', { name: 'Review deploy version 2' }))
    expect(handlers.onReview).toHaveBeenCalledWith('w1', 2)
  })

  it('tells others only that a version waits for an administrator, and gives them no switch', () => {
    data.place = { mayAdminister: false, mayRun: true, workflows: [workflow({ waiting: [{ number: 2, hash: 'h2', origin: 'PROPOSED', needsApprovalAgain: null, createdAt: new Date() }] })] }
    render(<WorkflowsListView place={place} {...handlers} />)
    expect(screen.queryByTestId('needs-you-row')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByTestId('workflow-state').textContent).toBe('On')
    expect(screen.getByText(/Waiting for an administrator/)).toBeTruthy()
  })

  it('turns a workflow off from its row', () => {
    data.place = { mayAdminister: true, mayRun: true, workflows: [workflow()] }
    render(<WorkflowsListView place={place} {...handlers} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(switchAction).toHaveBeenCalledWith({ workflowId: 'w1', enabled: false })
  })

  it('opens a workflow from its row', () => {
    data.place = { mayAdminister: false, mayRun: true, workflows: [workflow()] }
    render(<WorkflowsListView place={place} {...handlers} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open deploy' }))
    expect(handlers.onOpen).toHaveBeenCalledWith('w1')
  })

  it('shows the last run from the list\'s own answer, without reading each workflow\'s runs', () => {
    data.place = { mayAdminister: true, mayRun: true, workflows: [workflow({ lastRun: { id: 'r1', state: 'failed', startedAt: new Date(), endedAt: new Date(), onBehalfOfUserId: 'u1', agentId: null } })] }
    render(<WorkflowsListView place={place} {...handlers} />)
    expect(screen.getByTestId('workflow-row').textContent).toMatch(/last run .* ✕ by you/)
    expect(data.runsRead).toBe(0)
  })

  it('hides Run from someone who may not start runs', () => {
    data.place = { mayAdminister: false, mayRun: false, workflows: [workflow()] }
    render(<WorkflowsListView place={place} {...handlers} />)
    expect(screen.queryByRole('button', { name: 'Run deploy' })).toBeNull()
  })
})
