// @vitest-environment jsdom
/** The Tasks tool's views: the list, its scorecards and header (T1–T4), a new task, the backlog, done, a task and its session. */
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
    Flag: icon, X: icon, ChevronUp: icon, Diamond: icon, GripVertical: icon, Columns3: icon, ClipboardList: icon, Bug: icon,
    Lightbulb: icon, LifeBuoy: icon, Folder: icon,
  }
})
// dnd-kit would load the ui's own copy of React here; side by side, only what is drawn matters.
const uiDndCore = vi.hoisted(() => require('node:module').createRequire(require.resolve('@agenthix/ui/board')).resolve('@dnd-kit/core'))
vi.mock(uiDndCore, () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, setActivatorNodeRef: () => {}, transform: null, isDragging: false }),
  useDroppable: () => ({ isOver: false, setNodeRef: () => {} }),
}))
import {
  TasksList, TasksToolHeader, TasksScorecards, NewTaskRow, DoneList, TaskSessionView, TaskInTool, OverflowMenu,
  scorecardsOf, type ToolTask, type TaskListRowData, type TaskListCounts,
} from '@agenthix/ui/tasks'

const NOW = new Date('2026-10-07T12:00:00Z')
let n = 0
function task(over: Partial<ToolTask> = {}): ToolTask {
  n += 1
  return {
    id: `t${n}`, key: `WEB-${n}`, title: `Task ${n}`, priority: 'MEDIUM', state: 'TODO', runState: 'RUN_NONE', runStateReason: null,
    agent: { id: 'a1', name: 'Frontend dev', handle: 'fd' }, columnLabel: 'To do',
    project: { id: 'p1', key: 'WEB', name: 'Web' }, waitsForAgent: false, startsAt: null, workingSince: null, doneAt: null, result: null,
    createdAt: '2026-10-05T09:00:00Z', ...over,
  }
}

const row = (over: Partial<TaskListRowData> = {}): TaskListRowData => {
  n += 1
  return {
    id: `t${n}`, key: `WEB-${n}`, number: n, title: `Task ${n}`, priority: 'MEDIUM', state: 'TODO', executionState: 'NOT_STARTED',
    type: { name: 'Task', icon: 'task', kind: 'TASK' }, column: { id: 'c1', name: 'To do' },
    project: { id: 'p1', key: 'WEB', name: 'Web' }, agent: { id: 'a1', name: 'Frontend dev', handle: 'fd' }, runDetail: null,
    epic: null, sprint: null, due: null, late: false, fields: {},
    updatedAt: '2026-10-07T11:00:00Z', createdAt: '2026-10-05T09:00:00Z', progress: null, ...over,
  }
}

function list(rows: TaskListRowData[], over: Partial<React.ComponentProps<typeof TasksList>> = {}) {
  const props = { rows, kind: 'project' as const, now: NOW, onOpen: vi.fn(), onOpenRun: vi.fn(), emptyText: 'No task matches.', ...over }
  render(<TasksList {...props} />)
  return props
}

describe('the list: one line per task (T2) @SC-513 @SC-517', () => {
  it('is one flat list, with no groups, its type first and the column by name', () => {
    list([row({ title: 'Fix the contact form', type: { name: 'Bug', icon: 'bug', kind: 'CUSTOM' }, column: { id: 'c2', name: 'Fixing' } }), row()])
    expect(screen.queryByRole('heading')).toBeNull()
    const [bug] = screen.getAllByRole('listitem')
    expect(within(bug).getByRole('img', { name: 'Bug' }).getAttribute('data-icon')).toBe('bug')
    // The column shows on the wide line and on the narrow one; CSS shows one. Never its task state beside it.
    expect(within(bug).getAllByText('Fixing').length).toBe(2)
    expect(within(bug).queryByText('To do')).toBeNull()
  })

  it('says no run in words and offers no run button: the agent’s avatar carries the run as its ring', () => {
    list([row({ title: 'Running one', executionState: 'RUNNING', runDetail: null }), row({ executionState: 'FAILED', runDetail: 'Turn limit reached' })])
    expect(screen.queryByText(/Running ·|Not started|Run again|Review/)).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Run|Run again|Review|Assign)$/ })).toBeNull()
    expect(screen.getAllByRole('img', { name: 'Frontend dev · Running' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('img', { name: /Frontend dev · Failed · / }).length).toBeGreaterThan(0)
  })

  it('opens the task from its title, and the run from a ringed avatar', () => {
    const running = row({ title: 'Generate the sitemap', executionState: 'RUNNING' })
    const props = list([running, row({ title: 'Quiet one' })])
    fireEvent.click(screen.getByRole('button', { name: 'Generate the sitemap' }))
    expect(props.onOpen).toHaveBeenCalledWith(running)
    fireEvent.click(screen.getAllByRole('button', { name: `Open the run of ${running.key}` })[0])
    expect(props.onOpenRun).toHaveBeenCalledWith(running)
    // No ring, no button: the quiet one's avatar is only a picture.
    expect(screen.getAllByRole('button', { name: /Open the run of/ }).every(b => b.getAttribute('aria-label')?.endsWith(running.key))).toBe(true)
  })

  it('shows an agentless task as the empty circle and "No agent"', () => {
    list([row({ agent: null })])
    expect(screen.getAllByTestId('no-agent').length).toBeGreaterThan(0)
    expect(screen.getByText('No agent')).toBeTruthy()
  })

  it('writes the due date, a late one with Late, and a dash for none', () => {
    list([row({ due: '2026-10-12' }), row({ due: '2026-10-06', late: true }), row()])
    expect(screen.getAllByText('12 Oct').length).toBe(2)
    expect(screen.getAllByText('Late · 6 Oct')[0].className).toMatch(/text-danger/)
    expect(screen.getAllByText('—').length).toBe(1)
  })

  it('draws an epic as a line with its progress ring and its tasks', () => {
    list([row({ title: 'Launch pages', type: { name: 'Epic', icon: 'epic', kind: 'EPIC' }, agent: null, progress: { done: 3, total: 6, backlog: 0, todo: 1, inProgress: 2 } })], { byState: true })
    expect(screen.getAllByLabelText('3 of 6 done').length).toBe(2)
    expect(screen.getByText(/Epic · 6 tasks · 2 in progress · 1 to do/)).toBeTruthy()
  })

  it('names the chosen columns in its header, a custom field among them, and its value on each line', () => {
    const fields = [{ id: 'f1', name: 'Launch stage', options: [{ id: 'o1', name: 'Review' }] }]
    list([row({ fields: { f1: { optionId: 'o1', name: 'Review' } } })], { columns: ['column', 'field:f1', 'agent', 'due'], fields })
    expect(within(screen.getByTestId('list-header')).getAllByText(/./).map(e => e.textContent)).toEqual(['Task', 'Column', 'Launch stage', 'Agent', 'Due'])
    expect(screen.getByText('Review')).toBeTruthy()
  })

  it('asks for more with Show more', () => {
    const props = list([row()], { hasMore: true, onShowMore: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(props.onShowMore).toHaveBeenCalled()
  })

  it('puts the project first on Your tasks, and breaks it by when it is due', () => {
    list([row({ title: 'Mine', due: '2026-10-08' }), row({ due: '2026-10-03', late: true }), row()], { kind: 'mine', dueGroups: true })
    expect(screen.getAllByText('Web').length).toBeGreaterThan(1)
    expect(screen.getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Late', 'This week', 'No date'])
  })
})

describe('ticking lines (T4)', () => {
  it('shows the tick boxes in the planning view, and a tap on a line ticks it once some are ticked', () => {
    const onToggle = vi.fn()
    const a = row({ title: 'First' })
    const b = row({ title: 'Second' })
    const { rerender } = render(<TasksList rows={[a, b]} kind="project" now={NOW} onOpen={vi.fn()} emptyText="" selection={{ selected: new Set(), boxes: true, onToggle, onLongPress: vi.fn() }} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select First' }))
    expect(onToggle).toHaveBeenCalledWith(a)
    const onOpen = vi.fn()
    rerender(<TasksList rows={[a, b]} kind="project" now={NOW} onOpen={onOpen} emptyText="" selection={{ selected: new Set([a.id]), boxes: false, onToggle, onLongPress: vi.fn() }} />)
    expect((screen.getByRole('checkbox', { name: 'Select First' })).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Second' }))
    expect(onToggle).toHaveBeenLastCalledWith(b)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('has no tick boxes outside the planning view until something is ticked', () => {
    render(<TasksList rows={[row()]} kind="project" now={NOW} onOpen={vi.fn()} emptyText="" selection={{ selected: new Set(), boxes: false, onToggle: vi.fn(), onLongPress: vi.fn() }} />)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

describe('dragging to change the rank (D14)', () => {
  it('shows a handle on each line only while dragging is on', () => {
    const { unmount } = render(<TasksList rows={[row()]} kind="project" now={NOW} onOpen={vi.fn()} emptyText="" onMove={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Move WEB-\d+ in the order/ })).toBeTruthy()
    unmount()
    render(<TasksList rows={[row()]} kind="project" now={NOW} onOpen={vi.fn()} emptyText="" />)
    expect(screen.queryByRole('button', { name: /in the order/ })).toBeNull()
  })
})

const COUNTS: TaskListCounts = { all: 33, backlog: 9, todo: 7, inProgress: 6, done: 11, late: 1, noAgent: 8 }

describe('the scorecards (T1) @SC-513', () => {
  it('count the task state, Backlog first, then Late and No agent; never a run state', () => {
    render(<TasksScorecards cards={scorecardsOf(COUNTS, 'project')} chosen="backlog" onChoose={vi.fn()} />)
    const names = screen.getAllByRole('button').map(b => b.querySelector('span')!.textContent)
    expect(names).toEqual(['All', 'Backlog', 'To do', 'In progress', 'Done', 'Late', 'No agent'])
    expect(screen.queryByText(/Needs you|Running|Waiting|Not started/)).toBeNull()
    expect(screen.getByRole('button', { name: /Backlog/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('are the quick filters', () => {
    const onChoose = vi.fn()
    render(<TasksScorecards cards={scorecardsOf(COUNTS, 'project')} chosen={null} onChoose={onChoose} />)
    fireEvent.click(screen.getByRole('button', { name: /Late/ }))
    expect(onChoose).toHaveBeenCalledWith('late')
    fireEvent.click(screen.getByRole('button', { name: /All/ }))
    expect(onChoose).toHaveBeenLastCalledWith(null)
  })

  it('leave No agent off Your tasks', () => {
    expect(scorecardsOf(COUNTS, 'mine').map(c => c.label)).toEqual(['All', 'Backlog', 'To do', 'In progress', 'Done', 'Late'])
  })
})

describe('the header: search, filter chips, Fields and sort (T3) @SC-513 @SC-517', () => {
  const options = {
    types: [{ id: 'Bug', name: 'Bug' }, { id: 'Task', name: 'Task' }], columns: [], epics: [], sprints: [],
    agents: [{ id: 'a1', name: 'Frontend dev' }], projects: [], fields: [{ id: 'f1', name: 'Launch stage', options: [{ id: 'o1', name: 'Copy' }] }],
  }
  function header(over: Partial<React.ComponentProps<typeof TasksToolHeader>> = {}) {
    const props = {
      kind: 'project' as const, search: '', onSearch: vi.fn(), filters: {}, onFilters: vi.fn(), options,
      sort: 'rank' as const, onSort: vi.fn(), columns: ['column', 'agent', 'due'] as const, onColumns: vi.fn(), ...over,
    }
    render(<TasksToolHeader {...props} columns={[...props.columns]} />)
    return props
  }

  it('searches', () => {
    const props = header()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pricing' } })
    expect(props.onSearch).toHaveBeenCalledWith('pricing')
  })

  it('offers a project’s filters, its custom fields among them, and sets one from Filter', () => {
    const props = header()
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual([
      'Type', 'Column', 'Task state', 'Epic', 'Sprint', 'Agent', 'Priority', 'Launch stage', 'Archived',
    ])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Launch stage' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }))
    expect(props.onFilters).toHaveBeenCalledWith({ optionId: 'o1' })
  })

  it('shows a filter in use as a chip with ✕', () => {
    const props = header({ filters: { type: 'Bug', optionId: 'o1' } })
    expect(screen.getAllByText('Type: Bug').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Launch stage: Copy').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear Type: Bug' })[0])
    expect(props.onFilters).toHaveBeenCalledWith({ optionId: 'o1' })
  })

  it('sorts by Rank unless another is chosen', () => {
    const props = header()
    fireEvent.click(screen.getByRole('button', { name: /Sort: Rank/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Due date/ }))
    expect(props.onSort).toHaveBeenCalledWith('due')
  })

  it('adds a column from Fields', () => {
    const props = header()
    fireEvent.click(screen.getByRole('button', { name: /Fields/ }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Launch stage/ }))
    expect(props.onColumns).toHaveBeenCalledWith(['column', 'agent', 'due', 'field:f1'])
  })

  it('offers Your tasks Project first, and no Rank', () => {
    header({ kind: 'mine', sort: 'due' })
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual(['Project', 'Type', 'Column', 'Epic', 'Sprint', 'Agent', 'Priority'])
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: /Sort: Due date/ }))
    expect(screen.queryByRole('menuitemradio', { name: /Rank/ })).toBeNull()
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

describe('the done view @SC-514', () => {
  it('shows each done task with its result line', () => {
    const done = task({ state: 'DONE', doneAt: '2026-10-06T10:00:00Z', result: 'Fixed on the branch.' })
    render(<DoneList tasks={[done, task({ state: 'DONE', doneAt: '2026-10-05T10:00:00Z' })]} onOpen={vi.fn()} />)
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
    render(<OverflowMenu items={[{ label: 'Move to top', disabledReason: 'It is first in the project’s order', onSelect }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const item = screen.getByRole('menuitem', { name: /Move to top/ }) as HTMLButtonElement
    expect(item.disabled).toBe(true)
    expect(item.title).toBe('It is first in the project’s order')
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
