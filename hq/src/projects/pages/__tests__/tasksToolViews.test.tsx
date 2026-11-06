// @vitest-environment jsdom
/** The Tasks tool's views: the list, its scorecards and header (T7), a new task, the backlog, done, a task and its session. */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'

// ui resolves its own copy of lucide-react (see ProductOverviewTabSitePicker.test.tsx); its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/tasks')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()),
    Plus: icon, Search: icon, ChevronLeft: icon, MoreHorizontal: icon, Send: icon, ChevronDown: icon, ChevronRight: icon,
    Loader2: icon, Check: icon, Copy: icon, Bot: icon, Sparkles: icon, CheckCircle: icon, XCircle: icon,
  }
})
import {
  TasksList, TasksToolHeader, TasksScorecards, NewTaskRow, BacklogList, DoneList, TaskSessionView, TaskInTool, OverflowMenu,
  scorecardsOf, type ToolTask, type TaskListRowData, type TaskListCounts,
} from '@agenthix/ui/tasks'

const NOW = new Date('2026-10-07T12:00:00Z')
let n = 0
function task(over: Partial<ToolTask> = {}): ToolTask {
  n += 1
  return {
    id: `t${n}`, key: `WEB-${n}`, title: `Task ${n}`, priority: 'MEDIUM', status: 'TODO', runState: 'RUN_NONE', runStateReason: null,
    agent: { id: 'a1', name: 'Frontend dev', handle: 'fd' }, board: { id: 'b1', name: 'Sprint 3' }, columnLabel: 'To do',
    project: { id: 'p1', key: 'WEB', name: 'Web' }, waitsForAgent: false, startsAt: null, workingSince: null, doneAt: null, result: null,
    createdAt: '2026-10-05T09:00:00Z', ...over,
  }
}

const row = (over: Partial<TaskListRowData> = {}): TaskListRowData => {
  n += 1
  return {
    id: `t${n}`, key: `WEB-${n}`, number: n, title: `Task ${n}`, priority: 'MEDIUM', status: 'TODO', runState: 'RUN_NONE',
    runStateReason: null, isEpic: false, columnLabel: 'To do', board: { id: 'b1', name: 'Sprint 3' }, showBoard: false,
    project: { id: 'p1', key: 'WEB', name: 'Web' }, agent: { id: 'a1', name: 'Frontend dev', handle: 'fd' }, epic: null,
    queuedBy: null, waitsOn: null, waitsForAgent: false, latestRunCompleted: false, workingSince: null,
    updatedAt: '2026-10-07T11:00:00Z', createdAt: '2026-10-05T09:00:00Z', epicDate: null, progress: null, ...over,
  }
}

function list(rows: TaskListRowData[], over: Partial<React.ComponentProps<typeof TasksList>> = {}) {
  const props = {
    rows, kind: 'project' as const, now: NOW, onOpen: vi.fn(), onNextStep: vi.fn(), emptyText: 'No task matches.',
    renderAssign: (r: TaskListRowData) => <span>assign {r.key}</span>, ...over,
  }
  render(<TasksList {...props} />)
  return props
}

describe('the list: one line per task (T7) @SC-513 @SC-517', () => {
  const okay = row({ title: 'Fix the checkout redirect', runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval', waitsOn: { what: 'okay', who: 'you' } })
  const noAgent = row({ title: 'Update pricing copy', agent: null, runState: 'RUN_QUEUED', waitsForAgent: true })
  const running = row({ title: 'Generate the sitemap', runState: 'RUN_ACTIVE', workingSince: '2026-10-07T11:48:00Z' })

  it('is one flat list, with no groups', () => {
    list([okay, noAgent, running])
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('says where each stands in the state words, with the column as a chip', () => {
    list([okay, running, row({ columnLabel: null, title: 'In the backlog' })])
    expect(screen.getByText('Needs your okay')).toBeTruthy()
    expect(screen.getByText('Running · 12 min')).toBeTruthy()
    expect(screen.getByText('Not started')).toBeTruthy()
    expect(screen.getAllByText('To do').length).toBe(2)
    expect(screen.getByText('Backlog')).toBeTruthy()
  })

  it('puts the next step beside the state, Assign where there is no agent, and opens the task from its row', () => {
    const props = list([okay, noAgent])
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(props.onNextStep).toHaveBeenCalledWith(okay, 'review')
    expect(props.onOpen).not.toHaveBeenCalled()
    expect(screen.getByText(`assign ${noAgent.key}`)).toBeTruthy()
    fireEvent.click(screen.getByText('Update pricing copy'))
    expect(props.onOpen).toHaveBeenCalledWith(noAgent)
  })

  it('offers Run again where the last run failed, with the short reason', () => {
    const failed = row({ title: 'Failed one', runState: 'RUN_FAILED', runStateReason: 'Turn limit reached' })
    const props = list([failed])
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }))
    expect(props.onNextStep).toHaveBeenCalledWith(failed, 'runAgain')
    expect(screen.getByText('Failed · turn limit reached')).toBeTruthy()
  })

  it('leaves a Viewer’s rows with no next step', () => {
    list([okay], { mayAct: () => false })
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull()
  })

  it('draws an epic as a row marked Epic, with its progress ring and no state', () => {
    list([row({ title: 'Launch pages', isEpic: true, agent: null, progress: { done: 3, total: 5, needsYou: 1 } })])
    expect(screen.getByText('Epic')).toBeTruthy()
    expect(screen.getByLabelText('3 of 5 done')).toBeTruthy()
    expect(screen.queryByText('Not started')).toBeNull()
  })

  it('asks for more with Show more', () => {
    const props = list([row()], { hasMore: true, onShowMore: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(props.onShowMore).toHaveBeenCalled()
  })

  it('puts the project first on Your tasks', () => {
    list([row({ title: 'Mine' })], { kind: 'mine' })
    expect(screen.getByText('Web')).toBeTruthy()
  })
})

const COUNTS: TaskListCounts = {
  all: 13, needsYou: { count: 2, okay: 1, failed: 1, noAgent: 0 }, running: { count: 1 }, waiting: { count: 3 },
  notStarted: { count: 3 }, done: { count: 4, finished: 0 }, waitingOn: [{ name: 'Sam Okafor', count: 1 }],
}

describe('the scorecards (T7 ①) @SC-513', () => {
  it('show each state’s count and are the quick filters, the chosen one pressed', () => {
    const onChoose = vi.fn()
    render(<TasksScorecards cards={scorecardsOf(COUNTS, 'project')} chosen="needsYou" onChoose={onChoose} />)
    const needs = screen.getByRole('button', { name: /Needs you/ })
    expect(needs.getAttribute('aria-pressed')).toBe('true')
    expect(needs.textContent).toContain('1 okay · 1 failed')
    fireEvent.click(screen.getByRole('button', { name: /Waiting/ }))
    expect(onChoose).toHaveBeenCalledWith('waiting')
    fireEvent.click(screen.getByRole('button', { name: /All/ }))
    expect(onChoose).toHaveBeenLastCalledWith(null)
  })
})

describe('the header: search, filter chips and sort (T7 ③ ④) @SC-513 @SC-517', () => {
  const options = {
    agents: [{ id: 'a1', name: 'Frontend dev' }], boards: [{ id: 'b1', name: 'Sprint 3' }], epics: [], queuedBy: [],
    waitingOn: [], projects: [],
  }
  function header(over: Partial<React.ComponentProps<typeof TasksToolHeader>> = {}) {
    const props = {
      kind: 'project' as const, search: '', onSearch: vi.fn(), filters: {}, onFilters: vi.fn(), options,
      sort: 'importance' as const, onSort: vi.fn(), ...over,
    }
    render(<TasksToolHeader {...props} />)
    return props
  }

  it('searches', () => {
    const props = header()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pricing' } })
    expect(props.onSearch).toHaveBeenCalledWith('pricing')
  })

  it('adds a filter from ＋ Filter, and its chip’s ✕ clears it', () => {
    const props = header()
    fireEvent.click(screen.getByRole('button', { name: '＋ Filter' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Agent' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Frontend dev' }))
    expect(props.onFilters).toHaveBeenCalledWith({ agentId: 'a1' })
  })

  it('shows a filter in use as a chip with ✕', () => {
    const props = header({ filters: { agentId: 'a1' } })
    expect(screen.getByText('Agent: Frontend dev')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear Agent: Frontend dev' }))
    expect(props.onFilters).toHaveBeenCalledWith({})
  })

  it('sorts by Importance unless another is chosen', () => {
    const props = header()
    fireEvent.click(screen.getByRole('button', { name: /Sort: Importance/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Plan date/ }))
    expect(props.onSort).toHaveBeenCalledWith('planDate')
  })

  it('offers Your tasks only Project, Agent and Priority', () => {
    header({ kind: 'mine' })
    fireEvent.click(screen.getByRole('button', { name: '＋ Filter' }))
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['Project', 'Agent', 'Priority'])
  })
})

describe('a new task @SC-514', () => {
  it('adds the title typed in place, and clears the box', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<NewTaskRow onAdd={onAdd} onMoreDetails={vi.fn()} />)
    const input = screen.getByLabelText('New task title') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  Add a dark mode  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('Add a dark mode'))
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('opens the full form with the title typed so far', () => {
    const onMore = vi.fn()
    render(<NewTaskRow onAdd={vi.fn()} onMoreDetails={onMore} />)
    fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'Cookie banner' } })
    fireEvent.click(screen.getByRole('button', { name: 'More details' }))
    expect(onMore).toHaveBeenCalledWith('Cookie banner')
  })

  it('says why it did not add', async () => {
    render(<NewTaskRow onAdd={vi.fn().mockRejectedValue(new Error('No access'))} onMoreDetails={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('New task title'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect((await screen.findByRole('alert')).textContent).toBe('No access')
  })
})

describe('the backlog and done views @SC-514', () => {
  it('offers Add to board on each backlog task, with the boards to choose', () => {
    const t = task({ board: null, columnLabel: null, title: 'Dark mode' })
    const onAdd = vi.fn()
    render(<BacklogList tasks={[t]} boards={[{ id: 'b1', name: 'Sprint 3' }]} onOpen={vi.fn()} onAddToBoard={onAdd} />)
    fireEvent.change(screen.getByLabelText(`Add ${t.key} to a board`), { target: { value: 'b1' } })
    expect(onAdd).toHaveBeenCalledWith(t, 'b1')
  })

  it('shows each done task with its result line', () => {
    const done = task({ status: 'DONE', doneAt: '2026-10-06T10:00:00Z', result: 'Fixed on the branch.' })
    render(<DoneList tasks={[done, task({ status: 'DONE', doneAt: '2026-10-05T10:00:00Z' })]} onOpen={vi.fn()} />)
    expect(screen.getByText('Fixed on the branch.')).toBeTruthy()
    expect(screen.getByText('No result recorded.')).toBeTruthy()
  })
})

describe('a task inside the tool @SC-515', () => {
  it('shows the header, the title, Now, the tabs and the Details, with the Details folded on a narrow screen', () => {
    const onBack = vi.fn()
    render(
      <TaskInTool
        onBack={onBack} header={<header>WEB-27 header</header>} title={<h2>Fix the checkout redirect</h2>} description={<p>After payment…</p>}
        now={<section>now block</section>} tabs={<section>the tabs</section>} details={<span>details</span>} detailsSummary="Writer · High"
      />,
    )
    expect(screen.getByText('WEB-27 header')).toBeTruthy()
    expect(screen.getByText('now block')).toBeTruthy()
    expect(screen.getByText('the tabs')).toBeTruthy()
    const details = within(screen.getByLabelText('Details'))
    const fold = details.getByRole('button', { name: /Details.*Writer · High/ })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('true')
    expect(details.getByText('details')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Tasks/ }))
    expect(onBack).toHaveBeenCalled()
  })

  it('greys a menu item refused in advance, with why in its tooltip', () => {
    const onSelect = vi.fn()
    render(<OverflowMenu items={[{ label: 'Make this an epic', hint: 'Other tasks can then be filed under it', disabledReason: 'Unassign its agent first', onSelect }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const item = screen.getByRole('menuitem', { name: /Make this an epic/ }) as HTMLButtonElement
    expect(item.disabled).toBe(true)
    expect(item.title).toBe('Unassign its agent first')
    fireEvent.click(item)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('keeps archive and delete under the overflow button, asking again for a delete', () => {
    const onDelete = vi.fn()
    render(<OverflowMenu items={[{ label: 'Archive', onSelect: vi.fn() }, { label: 'Delete', danger: true, confirmLabel: 'Confirm: delete', onSelect: onDelete }]} />)
    expect(screen.queryByRole('menuitem')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Confirm: delete' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and returns focus to its button', () => {
    render(<OverflowMenu items={[{ label: 'Archive', onSelect: vi.fn() }]} />)
    const button = screen.getByRole('button', { name: 'More actions' })
    fireEvent.click(button)
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(document.activeElement).toBe(button)
  })
})

describe('the runs in the panel @SC-516 @SC-518', () => {
  const runs = [{ id: 'r1', status: 'COMPLETED', createdAt: '2026-10-07T09:31:00', endedAt: '2026-10-07T09:58:00', number: 1 }]
  function session() {
    const props = {
      backLabel: 'WEB-27', onBack: vi.fn(), summary: 'WEB-27 · Frontend dev · 1 run', agentName: 'Frontend dev',
      sessionId: 's1', socket: null, entries: [], runs, refetch: vi.fn().mockResolvedValue({ entries: [] }),
    }
    render(<TaskSessionView {...props} />)
    return props
  }

  it('goes back to the task', () => {
    const props = session()
    fireEvent.click(screen.getByRole('button', { name: /WEB-27/ }))
    expect(props.onBack).toHaveBeenCalled()
  })

  it('has no box to type into a run', () => {
    session()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByPlaceholderText(/what to do now/)).toBeNull()
  })
})
