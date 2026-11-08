// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

// The library's own copy of lucide-react would meet a second React here; its icons are not what these tests read.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/tasks')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), X: icon, Check: icon, ChevronDown: icon, Bold: icon, Code: icon, Heading2: icon, Italic: icon, Link: icon, List: icon, ListChecks: icon, ListOrdered: icon }
})

const data = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const actions = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>))
const mayWork = vi.hoisted(() => ({ value: true }))
vi.mock('wasp/client/operations', () => {
  const names = ['getProjectRoutines', 'getRoutineRunFacts', 'getRoutine', 'updateRoutine', 'runRoutineNow', 'deleteRoutine', 'getModelPickerChoices', 'getAgents', 'getProject']
  return {
    useQuery: (q: string) => ({ data: data.value[q], refetch: vi.fn() }),
    useAction: (op: string) => (actions[op] ??= vi.fn(() => Promise.resolve({ state: 'STARTING', reason: null }))),
    ...Object.fromEntries(names.map(n => [n, n])),
  }
})
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'sam', identities: { username: { id: 'Sam Okafor' } } } }) }))
vi.mock('wasp/client/webSocket', () => ({ useSocketListener: vi.fn() }))
vi.mock('../../../shared/hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWork: () => mayWork.value, VIEWER_CANNOT_WORK: 'You are a Viewer here' }))

import { RoutinesTool, NO_ROUTINES } from '../RoutinesTool'
import type { RoutineDetail, RoutineSummary } from '../../../shared/routineTypes'

const routine = (id: string, title: string, over: Partial<RoutineSummary> = {}): RoutineSummary => ({
  id, projectId: 'p', title, agent: { id: 'a', name: 'Reviewer' }, cron: '0 9 * * 1-5', timezone: 'UTC',
  scheduleWords: 'At 09:00, Monday to Friday, UTC', enabled: true, pausedReason: null, nextDueAt: '2030-01-07T09:00:00Z',
  onBehalfOf: { userId: 'kai', username: 'Kai Mensah' }, modelChoice: null, canChange: true, lastRuns: [], ...over,
})

const Where = () => { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div> }
function show(path = '/projects/WEB?tool=routines') {
  render(<MemoryRouter initialEntries={[path]}><RoutinesTool projectId="p" projectKey="WEB" placeName="Website relaunch" place={{ key: 'WEB' }} /><Where /></MemoryRouter>)
}

beforeEach(() => {
  mayWork.value = true
  for (const k of Object.keys(actions)) delete actions[k]
  data.value = {
    getProjectRoutines: [
      routine('r1', 'Weekly link check'),
      routine('r2', 'Daily summary', { onBehalfOf: { userId: 'sam', username: 'Sam Okafor' } }),
      routine('r3', 'Monthly analytics summary', { enabled: false, onBehalfOf: { userId: 'sam', username: 'Sam Okafor' } }),
    ],
    getRoutineRunFacts: { cost: {}, today: { ran: 2, running: 0, spent: 0.04 }, about: { r1: 'Checks every link on staging.' }, unanswered: [] },
  }
})
afterEach(cleanup)

describe("a place's Routines @SC-RT1", () => {
  it('shows the counts, Up next and a card per routine, each saying what it does and for whom', () => {
    show()
    expect(screen.getByRole('group', { name: 'Routines at a glance' }).textContent).toContain('Routines on2 of 3')
    const card = screen.getByRole('article', { name: 'Weekly link check' })
    expect(card.textContent).toContain('Reviewer · on behalf of Kai Mensah')
    expect(card.textContent).toContain('Checks every link on staging.')
    expect(screen.getByRole('article', { name: 'Daily summary' }).textContent).toContain('on behalf of Sam Okafor (you)')
    expect(screen.getByRole('article', { name: 'Monthly analytics summary' }).textContent).toContain('· off ·')
  })

  it('says what a routine is when there are none, without counts', () => {
    data.value.getProjectRoutines = []
    show()
    expect(screen.getByText(NO_ROUTINES)).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Routines at a glance' })).toBeNull()
  })

  it('greys Run now on a switched-off routine, with why', () => {
    show()
    const off = within(screen.getByRole('article', { name: 'Monthly analytics summary' }))
    const runNow = off.getAllByRole('button', { name: 'Run now' })[0] as HTMLButtonElement
    expect(runNow.disabled).toBe(true)
    expect(runNow.title).toBe('It is off: turn it on to run it')
  })

  it('opens New routine as its own page', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'New routine' }))
    expect(screen.getByTestId('where').textContent).toBe('/projects/WEB/routines/new')
  })
})

describe('saving asks first @SC-RT2', () => {
  it("asks before switching off someone else's routine, then saves it as a change (N6)", async () => {
    show()
    const card = within(screen.getByRole('article', { name: 'Weekly link check' }))
    fireEvent.click(card.getAllByRole('switch')[0])
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain("This routine will now run on your behalf (Sam Okafor), not Kai Mensah's.")
    expect(dialog.textContent).toContain('It will not run again until someone switches it on.')
    expect(actions.updateRoutine).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(actions.updateRoutine).toHaveBeenCalledWith({ routineId: 'r1', enabled: false }))
  })

  it('changes nothing when the question is cancelled', () => {
    show()
    fireEvent.click(within(screen.getByRole('article', { name: 'Weekly link check' })).getAllByRole('switch')[0])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(actions.updateRoutine).not.toHaveBeenCalled()
  })

  it('saves without asking when it already runs on your behalf', async () => {
    show()
    fireEvent.click(within(screen.getByRole('article', { name: 'Daily summary' })).getAllByRole('switch')[0])
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(actions.updateRoutine).toHaveBeenCalledWith({ routineId: 'r2', enabled: false }))
  })

  it('greys the switch and Run now for a Viewer', () => {
    data.value.getProjectRoutines = [routine('r1', 'Weekly link check', { canChange: false })]
    mayWork.value = false
    show()
    const card = within(screen.getByRole('article', { name: 'Weekly link check' }))
    expect((card.getAllByRole('switch')[0] as HTMLButtonElement).disabled).toBe(true)
    expect((card.getAllByRole('button', { name: 'Run now' })[0] as HTMLButtonElement).title).toBe('You are a Viewer here')
    expect((screen.getByRole('button', { name: 'New routine' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("a routine's page is its edit screen @SC-RT1", () => {
  const detail: RoutineDetail = {
    ...routine('r1', 'Weekly link check'), projectKey: 'WEB', isPersonal: false, instructions: 'Check every link.',
    nextTimes: [], createdBy: 'Kai Mensah', moreRuns: false,
    runs: [
      { id: 'x2', number: 2, dueAt: '2026-11-06T09:00:00Z', startedBy: { userId: 'sam', username: 'Sam Okafor' }, onBehalfOf: { userId: 'sam', username: 'Sam Okafor' }, state: 'FINISHED', ask: null, reason: null, sessionId: 's2', runId: 'run2', startedAt: '2026-11-06T09:00:00Z', endedAt: '2026-11-06T09:04:00Z' },
      { id: 'x1', number: null, dueAt: '2026-11-05T09:00:00Z', startedBy: null, onBehalfOf: { userId: 'kai', username: 'Kai Mensah' }, state: 'SKIPPED', ask: null, reason: 'run 1 was still running', sessionId: null, runId: null, startedAt: '2026-11-05T09:00:00Z', endedAt: null },
    ],
  }

  it('lists its runs, a skipped firing and a Run now among them, and changes the schedule in place', async () => {
    data.value.getRoutine = detail
    show('/projects/WEB?tool=routines&routine=r1')
    const runs = within(screen.getByRole('region', { name: 'Its runs' }))
    expect(runs.getByText('started by you (Run now)', { exact: false })).toBeTruthy()
    expect(runs.getByText('run 1 was still running', { exact: false })).toBeTruthy()
    expect(runs.getByRole('link', { name: 'Run 2' }).getAttribute('href')).toBe('/sessions/s2')
    expect(runs.getByRole('link', { name: /All in Runs/ }).getAttribute('href')).toBe('/projects/WEB?tool=runs&kind=routine&q=Weekly%20link%20check')

    fireEvent.click(screen.getByRole('button', { name: /Change/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Daily' }))
    expect((screen.getByLabelText('Advanced: cron expression') as HTMLInputElement).value).toBe('0 9 * * *')
    fireEvent.click(screen.getByRole('button', { name: 'Save change' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(actions.updateRoutine).toHaveBeenCalledWith({ routineId: 'r1', cron: '0 9 * * *', timezone: 'UTC' }))
  })
})
