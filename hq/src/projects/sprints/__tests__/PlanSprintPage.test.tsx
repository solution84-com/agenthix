// @vitest-environment jsdom
/** Plan Sprint (spec N1, D14): the two lists, moves by ⋯ saved as they are made, and a move that wasn't saved. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const day = (s: string) => new Date(`${s}T00:00:00Z`)
const card = (n: number, state: string, sprintId: string | null) => ({
  id: `t${n}`, number: n, key: `WEB-${n}`, title: `Task ${n}`, priority: 'MEDIUM', state, executionState: 'NOT_STARTED', sprintId, epicId: null,
  type: { id: 'task', name: 'Task', icon: 'task', kind: 'TASK' }, column: { id: 'c', name: state === 'BACKLOG' ? 'Backlog' : 'To do', colour: 'neutral', state },
  agent: null, needsYou: false,
})
const S5 = {
  id: 's5', projectId: 'p1', number: 5, name: null, goal: 'Launch pages ready for review', startDate: day('2026-11-16'), finishDate: day('2026-11-27'),
  finishedAt: null, unfinishedCount: null, unfinishedMovedOn: false, title: 'Sprint 5', status: 'upcoming', daysLeft: 12, daysOverdue: 0,
  counts: { BACKLOG: 0, TODO: 1, IN_PROGRESS: 0, DONE: 0, total: 1 }, atWork: { running: 0, needsYou: 0, waiting: 0 },
  load: [{ agentId: 'a1', name: 'Writer', count: 1 }, { agentId: 'a2', name: 'Designer', count: 0 }], epics: [{ epicId: 'e1', key: 'WEB-50', title: 'Launch pages', count: 1 }],
}

const ops = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), move: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useAction: (a: unknown) => a,
  useQuery: (q: string) => ({
    data: q === 'getProjectSprints' ? { lengthDays: 14, current: null, upcoming: [S5], past: [], mayPlanAhead: true }
      : q === 'getProjectSprintTasks' ? [card(7, 'TODO', 's5')]
        : q === 'getSprintPlanning' ? { tasks: [card(1, 'BACKLOG', null), card(2, 'TODO', null)], epics: [] } : undefined,
    refetch: () => Promise.resolve(),
  }),
  getProjectSprints: 'getProjectSprints', getProjectSprintTasks: 'getProjectSprintTasks', getSprintPlanning: 'getSprintPlanning',
  updateProjectSprint: vi.fn(), addTasksToSprint: ops.add, removeTasksFromSprint: ops.remove, moveTask: ops.move,
}))
vi.mock('../../place/useProjectPlace', () => ({ useProjectPlace: () => ({ project: { id: 'p1', key: 'WEB', name: 'Website relaunch', agents: [], defaultAgentId: null }, place: undefined }) }))
vi.mock('../../../shared/layouts/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWork: () => true, VIEWER_CANNOT_WORK: "You're a Viewer here." }))
vi.mock('../../../places/components/PlaceDrillMobileHeader', () => ({ PlaceDrillMobileHeader: () => null }))
vi.mock('../../../dock/DockContext', () => ({ useDock: () => null }))
vi.mock('@agenthix/ui/tasks', () => ({ RunAvatar: ({ children }: { children: React.ReactNode }) => <>{children}</>, TaskTypeMark: () => null }))
// In a worktree ui's lucide icons load a second React; the search box and filters are the library's, tested there.
vi.mock('@agenthix/ui/primitives', async (actual) => ({
  ...(await actual<Record<string, unknown>>()),
  SearchField: ({ label }: { label: string }) => <input aria-label={label} />,
  FilterSelect: ({ label, children }: { label: string; children: React.ReactNode }) => <select aria-label={label}>{children}</select>,
}))
vi.mock('@agenthix/ui/projects', () => ({ AutomationSwitch: ({ label }: { label: string }) => <button type="button" role="switch" aria-label={label} /> }))

import { PlanSprintPage } from '../PlanSprintPage'

afterEach(() => { cleanup(); vi.clearAllMocks() })

const show = () => render(
  <MemoryRouter initialEntries={['/projects/WEB/sprints/s5/plan']}>
    <Routes><Route path="/projects/:key/sprints/:sprintId/plan" element={<PlanSprintPage />} /></Routes>
  </MemoryRouter>,
)

describe('Plan Sprint', () => {
  it('shows Backlog and To do beside the sprint, with its goal, load and epics', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Plan Sprint 5' })).toBeTruthy()
    const left = screen.getByRole('list', { name: 'Backlog and To do' })
    expect(within(left).getByText('Task 1')).toBeTruthy()
    const sprint = screen.getByRole('region', { name: 'Sprint 5' })
    expect(within(sprint).getByText('Launch pages ready for review')).toBeTruthy()
    expect(within(sprint).getByText(/Designer 0/)).toBeTruthy()
    expect(within(sprint).getByText(/Launch pages · 1 of its tasks/)).toBeTruthy()
    expect(within(sprint).getByText(/A Backlog task dropped here moves to/)).toBeTruthy()
  })

  it("plans a task in from its ⋯, at the sprint's end, and moves one up the list", async () => {
    ops.add.mockResolvedValue({ taskIds: ['t1'] })
    ops.move.mockResolvedValue({})
    show()
    fireEvent.click(screen.getByRole('button', { name: 'WEB-1: more' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to Sprint 5' }))
    expect(ops.add).toHaveBeenCalledWith({ sprintId: 's5', taskIds: ['t1'], afterTaskId: 't7' })
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Backlog and To do' })).queryByText('Task 1')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'WEB-2: more' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }))
    expect(ops.move).toHaveBeenCalledWith({ taskId: 't2', beforeTaskId: 't1' })
  })

  it("says a move wasn't saved, with the task back where it was, and offers Try again", async () => {
    ops.remove.mockRejectedValue(new Error('The connection dropped.'))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'WEB-7: more' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Back to Backlog and To do' }))
    expect(ops.remove).toHaveBeenCalledWith({ projectId: 'p1', taskIds: ['t7'] })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/is back in Sprint 5, where it was/)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
