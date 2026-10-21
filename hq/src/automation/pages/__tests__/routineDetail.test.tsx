// @vitest-environment jsdom
/** One routine inside the Automation tool (every screen reviewed spec §3), as the agreed board draws it. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// The ui package resolves its own copy of lucide-react, which cannot render here: its icons are blanked.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/tasks')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, () => {
  const icon = () => null
  return { MoreHorizontal: icon, ChevronDown: icon, Plus: icon, X: icon }
})

const actions = vi.hoisted(() => new Map<string, ReturnType<typeof vi.fn>>())
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: undefined }),
  useAction: (name: string) => {
    if (!actions.has(name)) actions.set(name, vi.fn().mockResolvedValue(undefined))
    return actions.get(name)
  },
  pauseRoutine: 'pauseRoutine', resumeRoutine: 'resumeRoutine', deleteRoutine: 'deleteRoutine', unlinkRoutineRound: 'unlinkRoutineRound',
  runRoutineNow: 'runRoutineNow', skipRoutineRound: 'skipRoutineRound', updateRoutine: 'updateRoutine', getBoards: 'getBoards', getAgents: 'getAgents',
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'admin-1' } }) }))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWork: () => true }))

import { RoutineDetail } from '../RoutineDetail'
import type { RoutineDetail as Data } from '../../../shared/routineTypes'

afterEach(() => { cleanup(); actions.clear() })

const NOW = Date.now()
const at = (days: number) => new Date(NOW + days * 86_400_000).toISOString()
const round = (id: string, key: string, days: number, state: Data['rounds'][number]['state'], extra: Partial<Data['rounds'][number]> = {}) => ({
  id, key, title: 'Daily site audit', status: 'TODO', column: 'todo', runState: 'RUN_NONE', reason: null, archived: false,
  roundAt: at(days), createdAt: at(days - 1), waiting: days > 0, state, tookMs: null, ...extra,
})

function routine(extra: Partial<Data> = {}): Data {
  return {
    id: 'r1', title: 'Daily site audit', rule: { kind: 'weekly', time: '09:00', weekdays: [1, 2, 3, 4, 5] }, timezone: 'Australia/Sydney',
    enabled: true, pausedReason: null, nextRoundAt: at(1), onBehalfOf: { userId: 'avery', username: 'Avery' }, agentName: 'Frontend dev',
    place: 'Release board › To do', canManage: true, lastRounds: ['done', 'failed', 'waiting'],
    projectId: 'p1', projectKey: 'WEB', isPersonal: false, description: 'Crawl the preview', priority: 'MEDIUM', labels: ['audit'],
    assignedAgentId: 'a1', boardId: 'b1', column: 'todo', scheduleAt: '2026-10-01T09:00:00.000Z', createdBy: 'Avery',
    onBehalfOfHasAccess: true, isProjectAdmin: false, candidates: [],
    rounds: [
      round('t41', 'WEB-41', 1, 'waiting'),
      round('t38', 'WEB-38', -1, 'failed', { runState: 'RUN_FAILED', reason: 'timed out', tookMs: 360_000 }),
      round('t36', 'WEB-36', -2, 'done', { status: 'DONE', tookMs: 240_000 }),
    ],
    moreRounds: true,
    ...extra,
  }
}

const show = (data: Data, onBack = vi.fn(), onOlder = vi.fn()) => {
  render(<MemoryRouter><RoutineDetail routine={data} onBack={onBack} onOlder={onOlder} /></MemoryRouter>)
  return { onBack, onOlder }
}

describe('a routine @SC-684', () => {
  it('says what happens in one sentence, with its time zone and who set it up', () => {
    show(routine())
    expect(screen.getByText(/a task for/).textContent).toBe('Every weekday at 9:00, a task for Frontend dev in Release board › To do, on behalf of Avery.')
    expect(screen.getByText('Sydney time · set up by Avery')).toBeTruthy()
  })

  it('with no agent, says its rounds wait for a person, and offers no Run now', () => {
    show(routine({ agentName: null, assignedAgentId: null }))
    expect(screen.getByText(/a task in/).textContent).toContain('waiting for a person to start it')
    expect(screen.queryByRole('button', { name: 'Run now' })).toBeNull()
  })

  it('Run now and Skip this time act on the next round; Open goes to its task', async () => {
    show(routine())
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }))
    await waitFor(() => expect(actions.get('runRoutineNow')).toHaveBeenCalledWith({ routineId: 'r1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip this time' }))
    await waitFor(() => expect(actions.get('skipRoutineRound')).toHaveBeenCalledWith({ routineId: 'r1' }))
    expect(screen.getByRole('link', { name: 'Open WEB-41' }).getAttribute('href')).toBe('/tasks/WEB-41')
  })

  it('shows its last rounds as squares, then each round with its state and how long it took; Older rounds reads more', () => {
    const { onOlder } = show(routine())
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Last 3: 1 done · 1 failed · 1 waiting')
    expect(screen.getByText('Failed — timed out')).toBeTruthy()
    expect(screen.getByText('6 min')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Older rounds ›' }))
    expect(onOlder).toHaveBeenCalled()
  })

  it('edits in place: Edit opens the same form as New routine, which says what saving does to the waiting round @SC-686', () => {
    show(routine())
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(screen.getByText('Edit routine')).toBeTruthy()
    expect(screen.getByText('Saving moves the waiting round (WEB-41) to match; past rounds stay as they are.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Daily site audit' }))
    expect(screen.queryByText('Edit routine')).toBeNull()
  })

  it('its switch pauses it; Delete is under ⋯ and asks again in place @SC-686', async () => {
    const { onBack } = show(routine())
    fireEvent.click(screen.getByRole('switch', { name: 'Daily site audit on' }))
    await waitFor(() => expect(actions.get('pauseRoutine')).toHaveBeenCalledWith({ routineId: 'r1' }))
    fireEvent.click(screen.getByRole('button', { name: 'More for Daily site audit' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete routine' }))
    expect(actions.get('deleteRoutine')).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete — its waiting round goes too/ }))
    await waitFor(() => expect(onBack).toHaveBeenCalled())
    expect(actions.get('deleteRoutine')).toHaveBeenCalledWith({ routineId: 'r1' })
  })

  it('a viewer who may not manage it sees no switch, ⋯, Edit, Run now or Skip @SC-686', () => {
    show(routine({ canManage: false }))
    for (const name of ['Run now', 'Skip this time', 'Edit']) expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('tells a project admin when its person has lost access, and lets them take it over', async () => {
    show(routine({ isProjectAdmin: true, onBehalfOfHasAccess: false, enabled: false, pausedReason: 'its person lost access', candidates: [] }))
    const when = screen.getByText(/can no longer work in this project/)
    expect(when.textContent).toContain('Avery can no longer work in this project, so the routine is paused.')
    fireEvent.click(within(when).getByRole('button', { name: 'Take it over' }))
    await waitFor(() => expect(actions.get('updateRoutine')).toHaveBeenCalledWith({ routineId: 'r1', onBehalfOfUserId: 'admin-1' }))
  })
})
