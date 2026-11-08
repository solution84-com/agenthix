// @vitest-environment jsdom
/** Sprints (spec D13, N7): no sprints yet, the current sprint and its plan, overdue, and Finish sprint's question. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const day = (s: string) => new Date(`${s}T00:00:00Z`)
const counts = (todo: number, prog: number, done: number) => ({ BACKLOG: 0, TODO: todo, IN_PROGRESS: prog, DONE: done, total: todo + prog + done })
const summary = (id: string, number: number, status: string, start: string, finish: string, over: Record<string, unknown> = {}) => ({
  id, projectId: 'p1', number, name: null, goal: null, startDate: day(start), finishDate: day(finish), finishedAt: null,
  unfinishedCount: null, unfinishedMovedOn: false, title: `Sprint ${number}`, status, daysLeft: 7, daysOverdue: 0,
  counts: counts(0, 0, 0), atWork: { running: 0, needsYou: 0, waiting: 0 }, load: [], epics: [], ...over,
})
const card = (n: number, title: string) => ({
  id: `t${n}`, number: n, key: `WEB-${n}`, title, priority: 'MEDIUM', state: 'TODO', executionState: 'RUNNING', sprintId: 's4', epicId: null,
  type: { id: 'bug', name: 'Bug', icon: 'bug', kind: 'CUSTOM' }, column: { id: 'c', name: 'Fixing', colour: 'neutral', state: 'IN_PROGRESS' },
  agent: { id: 'a', name: 'Writer', handle: 'writer', avatarUrl: null }, needsYou: false,
})

const ops = vi.hoisted(() => ({ series: null as unknown, mayWork: true, finish: vi.fn(() => Promise.resolve({})), start: vi.fn(() => Promise.resolve({})) }))
vi.mock('wasp/client/operations', () => ({
  useAction: (a: unknown) => a,
  useQuery: (q: string) => ({
    data: q === 'getProjectByKey' ? { id: 'p1', key: 'WEB' } : q === 'getProjectSprints' ? ops.series : q === 'getProjectSprintTasks' ? [1, 2, 3, 4, 5, 6].map(n => card(n, `Task ${n}`)) : undefined,
    refetch: vi.fn(),
  }),
  getProjectByKey: 'getProjectByKey', getProjectSprints: 'getProjectSprints', getProjectSprintTasks: 'getProjectSprintTasks',
  startSprints: ops.start, planNextSprint: vi.fn(), setSprintLength: vi.fn(), updateProjectSprint: vi.fn(), finishProjectSprint: ops.finish,
}))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWork: () => ops.mayWork, VIEWER_CANNOT_WORK: "You're a Viewer here." }))
vi.mock('../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <span>{name[0]}</span> }))
// The ring is the shared library's, tested there; here it is its words.
vi.mock('@agenthix/ui/tasks', () => ({ RunAvatar: ({ name, state, children }: { name: string; state: string; children: React.ReactNode }) => <span title={`${name} · ${state}`}>{children}</span> }))

import { SprintsTool } from '../SprintsTool'

afterEach(() => { cleanup(); vi.clearAllMocks(); ops.mayWork = true })

const show = () => render(<MemoryRouter><SprintsTool projectKey="WEB" workroomHref="/projects/WEB?tool=runs" /></MemoryRouter>)

describe('Sprints', () => {
  it('with no sprints, says what they are and offers Start sprints, which asks the length and the first day', () => {
    ops.series = { lengthDays: null, current: null, upcoming: [], past: [], mayPlanAhead: false }
    show()
    expect(screen.getByText('No sprints yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start sprints' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Each sprint lasts')).toBeTruthy()
    expect(within(dialog).getByLabelText('The first begins')).toBeTruthy()
  })

  it('shows the current sprint by task state, what is at work, its first tasks, the upcoming ones and the past link', () => {
    ops.series = {
      lengthDays: 14,
      current: summary('s4', 4, 'current', '2026-11-02', '2026-11-13', { counts: counts(2, 3, 5), atWork: { running: 2, needsYou: 1, waiting: 1 } }),
      upcoming: [summary('s5', 5, 'upcoming', '2026-11-16', '2026-11-27', { counts: counts(4, 0, 0) }), summary('s6', 6, 'upcoming', '2026-11-30', '2026-12-11')],
      past: [summary('s3', 3, 'past', '2026-10-19', '2026-10-30', { counts: counts(0, 0, 9), unfinishedCount: 2, unfinishedMovedOn: true })],
      mayPlanAhead: false,
    }
    show()
    expect(screen.getByRole('heading', { name: 'Sprint 4' })).toBeTruthy()
    expect(screen.getByText('One series for the project: 2 weeks each, from Monday.')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'To do 2, In progress 3, Done 5' })).toBeTruthy()
    expect(screen.getByText(/At work now: 2 running · 1 needs you · 1 waiting/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Plan Sprint 5' })).toBeTruthy()
    const table = screen.getByRole('table', { name: "The sprint's tasks" })
    expect(within(table).getAllByRole('row')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: /2 more/ }))
    expect(within(screen.getByRole('table', { name: "The sprint's tasks" })).getAllByRole('row')).toHaveLength(7)
    const upcoming = screen.getByRole('region', { name: 'Upcoming' })
    expect(within(upcoming).getAllByText('4 tasks planned').length).toBeGreaterThan(0)
    expect(within(upcoming).getAllByText('Nothing planned yet').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Past sprints \(1\)/ }))
    expect(within(screen.getByRole('dialog')).getAllByText(/9 done · 2 moved to Sprint 4/).length).toBeGreaterThan(0)
  })

  it('keeps a sprint past its last day current, saying how long ago it ended (N7)', () => {
    ops.series = { lengthDays: 14, current: summary('s4', 4, 'current', '2026-10-20', '2026-10-31', { daysLeft: 0, daysOverdue: 2 }), upcoming: [], past: [], mayPlanAhead: true }
    show()
    expect(screen.getByText(/ended 2 days ago/)).toBeTruthy()
  })

  it('asks where the tasks not done go, the next sprint chosen first, and finishes with that', () => {
    ops.series = {
      lengthDays: 14, current: summary('s4', 4, 'current', '2026-11-02', '2026-11-13', { counts: counts(2, 3, 5) }),
      upcoming: [summary('s5', 5, 'upcoming', '2026-11-16', '2026-11-27')], past: [], mayPlanAhead: true,
    }
    show()
    fireEvent.click(screen.getAllByRole('button', { name: 'Finish sprint…' })[0])
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/stay recorded in Sprint 4/)).toBeTruthy()
    expect(within(dialog).getByRole('radio', { name: /Sprint 5/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(within(dialog).getByRole('radio', { name: /No sprint/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Finish sprint' }))
    expect(ops.finish).toHaveBeenCalledWith({ sprintId: 's4', unfinished: 'none' })
  })

  it('finishes at once, without asking, when every task is done', () => {
    ops.series = { lengthDays: 14, current: summary('s4', 4, 'current', '2026-11-02', '2026-11-13', { counts: counts(0, 0, 4) }), upcoming: [], past: [], mayPlanAhead: true }
    show()
    fireEvent.click(screen.getAllByRole('button', { name: 'Finish sprint…' })[0])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(ops.finish).toHaveBeenCalledWith({ sprintId: 's4' })
  })

  it('greys the changes for a Viewer, saying why', () => {
    ops.mayWork = false
    ops.series = { lengthDays: 14, current: summary('s4', 4, 'current', '2026-11-02', '2026-11-13'), upcoming: [], past: [], mayPlanAhead: true }
    show()
    const plan = screen.getByRole('button', { name: 'Plan Sprint 5' }) as HTMLButtonElement
    expect(plan.disabled).toBe(true)
    expect(plan.title).toBe("You're a Viewer here.")
  })
})
