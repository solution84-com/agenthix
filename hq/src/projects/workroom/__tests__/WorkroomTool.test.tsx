// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const useQuery = vi.hoisted(() => vi.fn())
const actions = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>))
const mayWork = vi.hoisted(() => ({ value: true }))
vi.mock('wasp/client/operations', () => {
  const names = ['getWorkroom', 'getAgentStartPlan', 'reorderWorkroomAgents', 'runTask', 'startAgentInProject', 'startAllAgents',
    'stopAgentInProject', 'stopPlaceRuns', 'stopTask', 'stopTaskSession']
  return {
    useQuery,
    useAction: (op: string) => (actions[op] ??= vi.fn(() => Promise.resolve())),
    ...Object.fromEntries(names.map(n => [n, n])),
  }
})
vi.mock('wasp/client/webSocket', () => ({ useSocketListener: vi.fn() }))
vi.mock('../../../shared/hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../../shared/hooks/useMayWork', () => ({
  useMayWork: () => mayWork.value, useMayWorkWhere: () => () => mayWork.value, VIEWER_CANNOT_WORK: 'You are a Viewer here',
}))
vi.mock('../../../shared/hooks/useIsMobile', () => ({ useIsMobile: () => false }))

import { WorkroomTool } from '../WorkroomTool'
import { NO_COUNTS, countsOf } from '../workroomRules'
import type { WorkroomAgent, WorkroomProject } from '../workroomTypes'

const agent = (over: Partial<WorkroomAgent>): WorkroomAgent => ({
  agentId: 'a', name: 'Writer', handle: 'writer', avatarUrl: null, role: 'Writes pages and copy', ring: null, ready: 0, inLine: 0,
  runsToday: 0, spentToday: 0, now: [], line: [], needs: [], finishedToday: 0, lastFinished: null, ...over,
})

const writer = agent({
  agentId: 'w', ring: 'RUNNING', ready: 1, inLine: 1, runsToday: 5, spentToday: 0.21, finishedToday: 5,
  now: [{ key: 't14', kind: 'task', title: 'Fix the contact form', taskId: 't14', taskKey: 'WEB-14', href: '/tasks/WEB-14', sessionId: 's14', runNumber: 1, since: null, startedBy: 'you' }],
  line: [{ taskId: 't4', taskKey: 'WEB-4', title: 'Draft the case-study page', href: '/tasks/WEB-4', why: { kind: 'next', after: 'Fix the contact form' } }],
  needs: [
    { taskId: 't7', taskKey: 'WEB-7', title: 'Find out why two pages load slowly', href: '/tasks/WEB-7', reason: 'failed', detail: 'the build command failed', runNumber: 1, since: '2026-11-07T11:40:00Z' },
    { taskId: 't2', taskKey: 'WEB-2', title: 'Write the home page copy', href: '/tasks/WEB-2', reason: 'approval', detail: null, runNumber: 1, since: '2026-11-07T11:40:00Z' },
  ],
  lastFinished: { kind: 'task', title: 'Plan the site map', href: '/tasks/WEB-1', at: new Date().toISOString() },
})
const tester = agent({ agentId: 't', name: 'Tester', role: 'Tests forms and flows' })

function room(agents: WorkroomAgent[], over: Partial<WorkroomProject> = {}): WorkroomProject {
  return { projectId: 'p', projectKey: 'WEB', projectName: 'Website relaunch', personal: false, counts: countsOf(agents), agents, nothingYet: false, unanswered: [], ...over }
}

function show(r: WorkroomProject, admin = true) {
  useQuery.mockImplementation((op: string) => (op === 'getWorkroom'
    ? { data: r, refetch: vi.fn() }
    : { data: { agents: [{ agentId: 'w', name: 'Writer', handle: 'writer', avatarUrl: null, running: [], ready: [
      { id: 'r1', key: 'WEB-82', title: 'Choose a host', typeName: 'Task', columnName: 'To do' },
      { id: 'r2', key: 'WEB-84', title: 'List accessibility issues', typeName: 'Bug', columnName: 'Triaged' },
    ] }], cantRun: [{ id: 'e', key: 'WEB-8', title: 'Launch the new website', typeName: 'Epic', columnName: null, agentId: 'w', reason: 'epic' }] } }))
  render(<MemoryRouter><WorkroomTool projectId="p" projectKey="WEB" projectName="Website relaunch" isProjectAdmin={admin} /></MemoryRouter>)
}

beforeEach(() => { mayWork.value = true; for (const k of Object.keys(actions)) delete actions[k] })
afterEach(cleanup)

describe('the Workroom', () => {
  it('counts about running only, and draws one scorecard per agent with its ring as its status', () => {
    show(room([writer, tester]))
    const counts = screen.getByRole('group', { name: 'Runs today' })
    expect(within(counts).getByText('Spent today')).toBeTruthy()
    expect(within(counts).getByText('$0.21')).toBeTruthy()
    const card = screen.getByRole('article', { name: 'Writer' })
    expect(within(card).getAllByRole('img')[0].getAttribute('data-run')).toBe('RUNNING')
    expect(within(card).getByText('Now')).toBeTruthy()
    expect(within(card).getByText('next, after Fix the contact form')).toBeTruthy()
    expect(within(card).getAllByTestId('needs-you-bar')).toHaveLength(2)
    expect(within(screen.getByRole('article', { name: 'Tester' })).getByText('Nothing needs you, nothing running, nothing in line.')).toBeTruthy()
  })

  it('rings a failure as Failed and offers Run again, which runs the task again', () => {
    show(room([writer]))
    const bar = screen.getAllByTestId('needs-you-bar')[0]
    expect(within(bar).getAllByRole('img')[0].getAttribute('data-run')).toBe('FAILED')
    fireEvent.click(within(bar).getByRole('button', { name: 'Run again' }))
    expect(actions.runTask).toHaveBeenCalledWith({ taskId: 't7' })
  })

  it("greys an agent's Start and Stop with why when there is nothing to start or stop", () => {
    show(room([tester]))
    const card = screen.getByRole('article', { name: 'Tester' })
    const start = within(card).getByRole('button', { name: 'Start' }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    expect(start.title).toBe('No task is ready for Tester')
    expect((within(card).getByRole('button', { name: 'Stop' }) as HTMLButtonElement).title).toBe('Nothing is running')
  })

  it("starts an agent on the tasks left ticked, after a confirm that lists what can't run", () => {
    show(room([writer]))
    fireEvent.click(within(screen.getByRole('article', { name: 'Writer' })).getByRole('button', { name: 'Start' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Can’t run')).toBeTruthy()
    expect(within(dialog).getByText('an epic: never run')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /WEB-84/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start 1 task' }))
    expect(actions.startAgentInProject).toHaveBeenCalledWith({ projectId: 'p', agentId: 'w', taskIds: ['r1'] })
  })

  it("puts the agent's ringed avatar before the Start dialog's title, and reads a Can't run line as one sentence", () => {
    show(room([writer]))
    fireEvent.click(within(screen.getByRole('article', { name: 'Writer' })).getByRole('button', { name: 'Start' }))
    const dialog = screen.getByRole('dialog', { name: 'Start Writer on 2 tasks?' })
    const titleRow = within(dialog).getByRole('heading', { name: 'Start Writer on 2 tasks?' }).parentElement!
    expect(within(titleRow).getAllByRole('img')[0].getAttribute('aria-label')).toMatch(/^Writer/)
    expect(within(dialog).getByText('an epic: never run').parentElement!.textContent).toBe('WEB-8Launch the new website · an epic: never run')
  })

  it('greys Start with every tick cleared', () => {
    show(room([writer]))
    fireEvent.click(within(screen.getByRole('article', { name: 'Writer' })).getByRole('button', { name: 'Start' }))
    const dialog = screen.getByRole('dialog')
    for (const box of within(dialog).getAllByRole('checkbox')) fireEvent.click(box)
    const go = within(dialog).getByRole('button', { name: 'Start 0 tasks' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    expect(go.title).toBe('Nothing ticked')
  })

  it("keeps Stop every run for the project's admins, and greys it with nothing running", () => {
    show(room([writer]), false)
    expect((screen.getByRole('button', { name: 'Stop every run…' }) as HTMLButtonElement).title).toMatch(/admins/)
    cleanup()
    show(room([tester]))
    expect((screen.getByRole('button', { name: 'Stop every run…' }) as HTMLButtonElement).title).toBe('Nothing is running')
  })

  it('asks once before Stop every run, naming what happens to the waiting tasks', () => {
    show(room([writer]))
    fireEvent.click(screen.getByRole('button', { name: 'Stop every run…' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/taken out of line/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stop 2 runs' }))
    expect(actions.stopPlaceRuns).toHaveBeenCalledWith({ projectId: 'p' })
  })

  it('closes Stop every run… from the ✕ at its title, stopping nothing', () => {
    show(room([writer]))
    fireEvent.click(screen.getByRole('button', { name: 'Stop every run…' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(actions.stopPlaceRuns?.mock.calls.length ?? 0).toBe(0)
  })

  it('lists in Now only what is paused for the person; a failed run is left to its bar', () => {
    show(room([agent({ agentId: 'm', name: 'Maple', needs: [
      { taskId: 't31', taskKey: 'WEB-31', title: 'Check the forms', href: '/tasks/WEB-31', reason: 'failed', detail: null, runNumber: 1, since: '2026-11-07T11:40:00Z' },
    ] })]))
    const card = screen.getByRole('article', { name: 'Maple' })
    expect(within(card).queryByText('Now')).toBeNull()
    expect(within(card).queryByText(/Waiting for you/)).toBeNull()
    expect(within(card).getAllByTestId('needs-you-bar')).toHaveLength(1)
  })

  it('narrows the cards to the agents that need the person from the Needs you count', () => {
    show(room([writer, tester]))
    fireEvent.click(within(screen.getByRole('group', { name: 'Runs today' })).getByRole('button', { name: /Needs you/ }))
    expect(screen.queryByRole('article', { name: 'Tester' })).toBeNull()
    expect(screen.getByRole('article', { name: 'Writer' })).toBeTruthy()
  })

  it('says how work starts in a project where nothing has run', () => {
    show(room([tester], { nothingYet: true, counts: { ...NO_COUNTS } }))
    expect(screen.getByText(/Nothing has run in this project yet/)).toBeTruthy()
  })

  it('lets a Viewer read it, with every control greyed and why', () => {
    mayWork.value = false
    show(room([writer]), false)
    const start = within(screen.getByRole('article', { name: 'Writer' })).getByRole('button', { name: 'Start' }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    expect(start.title).toBe('You are a Viewer here')
    expect((screen.getByRole('button', { name: 'Start all agents…' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
