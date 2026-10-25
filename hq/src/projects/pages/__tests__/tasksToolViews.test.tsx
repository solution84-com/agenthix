// @vitest-environment jsdom
/** The Tasks tool's views (every screen reviewed spec §3): the list, its header, a new task, the backlog, done, a task and its session. */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'

// ui resolves its own copy of lucide-react (see ProductOverviewTabSitePicker.test.tsx); its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/tasks')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, () => {
  const icon = () => null
  return {
    Plus: icon, Search: icon, ChevronLeft: icon, MoreHorizontal: icon, Send: icon, ChevronDown: icon, ChevronRight: icon,
    Loader2: icon, Check: icon, Copy: icon, Bot: icon, Sparkles: icon, CheckCircle: icon, XCircle: icon,
  }
})
import {
  TasksList, TasksToolHeader, NewTaskRow, BacklogList, DoneList, TaskSessionView, TaskInTool, OverflowMenu,
  groupTasks, NO_TASK_FILTER, type ToolTask,
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

function list(tasks: ToolTask[], over: Partial<React.ComponentProps<typeof TasksList>> = {}) {
  const props = {
    groups: groupTasks(tasks), now: NOW, onOpen: vi.fn(), onAction: vi.fn(), renderAssign: (t: ToolTask) => <span>assign {t.key}</span>, ...over,
  }
  render(<TasksList {...props} />)
  return props
}

describe('the list @SC-513 @SC-517', () => {
  const blocked = task({ title: 'Fix the checkout redirect', runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' })
  const noAgent = task({ title: 'Update pricing copy', agent: null, runState: 'RUN_QUEUED', waitsForAgent: true })
  const running = task({ title: 'Generate the sitemap', runState: 'RUN_ACTIVE', workingSince: '2026-10-07T11:48:00Z' })
  const next = task({ title: 'Pricing table component', runState: 'RUN_QUEUED' })

  it('shows the three groups with their counts, and no tabs', () => {
    list([blocked, noAgent, running, next])
    expect(screen.getByRole('heading', { name: /Needs you/ }).textContent).toContain('2')
    expect(screen.getByRole('heading', { name: /Working on/ }).textContent).toContain('1')
    expect(screen.getByRole('heading', { name: /Up next/ }).textContent).toContain('1')
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('names how long a run has been going, and where a waiting task sits on its board', () => {
    list([running, next])
    expect(screen.getByText('Running · 12 min')).toBeTruthy()
    expect(screen.getByText('In line')).toBeTruthy()
    expect(screen.getAllByText('Sprint 3 · To do').length).toBeGreaterThan(0)
  })

  it('puts Review in a task a person must look at, Assign where there is no agent, and opens the task from its row', () => {
    const props = list([blocked, noAgent])
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(props.onAction).toHaveBeenCalledWith(blocked, 'review')
    expect(props.onOpen).not.toHaveBeenCalled()
    expect(screen.getByText(`assign ${noAgent.key}`)).toBeTruthy()
    fireEvent.click(screen.getByText('Update pricing copy'))
    expect(props.onOpen).toHaveBeenCalledWith(noAgent)
  })

  it('offers Run again where the last run failed', () => {
    const failed = task({ title: 'Failed one', runState: 'RUN_FAILED', runStateReason: 'Turn limit reached' })
    const props = list([failed])
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }))
    expect(props.onAction).toHaveBeenCalledWith(failed, 'runAgain')
    expect(screen.getByText('Turn limit reached')).toBeTruthy()
  })

  it('shows eight Up next at first and the rest on request', () => {
    const many = Array.from({ length: 10 }, (_, i) => task({ title: `Queued ${i}` }))
    list(many)
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: '2 more' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
  })

  it('adds the project to each task in Your tasks', () => {
    list([next], { showProject: true })
    expect(screen.getAllByText('Web').length).toBeGreaterThan(0)
  })
})

describe('the header @SC-513 @SC-517', () => {
  function header(over: Partial<React.ComponentProps<typeof TasksToolHeader>> = {}) {
    const props = {
      backlogCount: 7, doneCount: 23, filter: NO_TASK_FILTER, onFilter: vi.fn(), agents: [{ id: 'a1', name: 'Frontend dev' }],
      boards: [{ id: 'b1', name: 'Sprint 3' }], onOpenBacklog: vi.fn(), onOpenDone: vi.fn(), onNewTask: vi.fn(), ...over,
    }
    render(<TasksToolHeader {...props} />)
    return props
  }

  it('has Backlog and Done with their counts, always in reach', () => {
    const props = header()
    fireEvent.click(screen.getByRole('button', { name: /Backlog/ }))
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))
    expect(props.onOpenBacklog).toHaveBeenCalled()
    expect(props.onOpenDone).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Backlog/ }).textContent).toContain('7')
    expect(screen.getByRole('button', { name: /Done/ }).textContent).toContain('23')
  })

  it('searches, and offers the filters for the wide tool', () => {
    const props = header()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pricing' } })
    expect(props.onFilter).toHaveBeenCalledWith({ ...NO_TASK_FILTER, search: 'pricing' })
    fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'a1' } })
    expect(props.onFilter).toHaveBeenLastCalledWith({ ...NO_TASK_FILTER, agentId: 'a1' })
    expect(screen.getByLabelText('Board')).toBeTruthy()
    expect(screen.getByLabelText('Priority')).toBeTruthy()
  })

  it('has no Backlog button where there is no backlog (Your tasks)', () => {
    header({ backlogCount: undefined, onOpenBacklog: undefined, onNewTask: undefined, projects: [{ key: 'WEB', name: 'Web' }], boards: undefined })
    expect(screen.queryByRole('button', { name: /Backlog/ })).toBeNull()
    expect(screen.getByLabelText('Project')).toBeTruthy()
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
  it('shows the key line, the title, what waits, the comments and the facts, with one action', () => {
    const onBack = vi.fn()
    render(
      <TaskInTool
        onBack={onBack} keyLine="WEB-27 · Sprint 3 · In progress" title={<h2>Fix the checkout redirect</h2>} description={<p>After payment…</p>}
        waiting={<section>waiting card</section>} comments={<section>comments</section>} facts={<span>facts</span>}
        action={<button>Approve</button>} menu={<OverflowMenu items={[{ label: 'Archive', onSelect: vi.fn() }]} />}
      />,
    )
    expect(screen.getByText('WEB-27 · Sprint 3 · In progress')).toBeTruthy()
    expect(screen.getByText('waiting card')).toBeTruthy()
    expect(within(screen.getByLabelText('Task facts')).getByText('facts')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Tasks/ }))
    expect(onBack).toHaveBeenCalled()
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

describe('the session in the panel @SC-516 @SC-518', () => {
  const entry = (id: string, role: string, content: string, at: string, runId = 'r1') => ({
    id, role, content, thought: null, thinkingDurationMs: null, toolName: null, toolInput: null, toolOutput: null, model: null, createdAt: at, usage: null, runId,
  })
  const entries = [entry('1', 'USER', 'Use staging', '2026-10-07T09:32:00'), entry('2', 'ASSISTANT', 'On it.', '2026-10-07T09:33:00')]
  const runs = [{ id: 'r1', status: 'COMPLETED', createdAt: '2026-10-07T09:31:00', endedAt: '2026-10-07T09:58:00' }]
  function session(over: Partial<React.ComponentProps<typeof TaskSessionView>> = {}) {
    const props = {
      backLabel: 'WEB-27', onBack: vi.fn(), summary: 'WEB-27 · Frontend dev · 1 run', agentName: 'Frontend dev',
      sessionId: 's1', socket: null, entries, runs, refetch: vi.fn().mockResolvedValue({ entries }),
      onSend: vi.fn().mockResolvedValue(undefined), ...over,
    }
    render(<TaskSessionView {...props} />)
    return props
  }

  it('shows the transcript with each run as a divider', () => {
    session()
    const dividers = screen.getAllByRole('separator').map(d => d.textContent)
    expect(dividers[0]).toContain('Run 1 · 09:31')
    expect(dividers[1]).toContain('Run 1 finished · 09:58')
    expect(screen.getByText('Use staging')).toBeTruthy()
  })

  it('goes back to the task', () => {
    const props = session()
    fireEvent.click(screen.getByRole('button', { name: /WEB-27/ }))
    expect(props.onBack).toHaveBeenCalled()
  })

  it('sends what is typed into the session, with the hint that anything to keep goes in a comment', async () => {
    const props = session()
    expect(screen.getByText(/goes in a comment/)).toBeTruthy()
    const box = screen.getByPlaceholderText('Tell Frontend dev what to do now…') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'Approve it, but use staging' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(props.onSend).toHaveBeenCalledWith('Approve it, but use staging'))
    await waitFor(() => expect(box.value).toBe(''))
  })

  it('does not offer the box to someone who may not start runs, and says why', () => {
    session({ sendDisabledReason: "Your role can't start runs." })
    expect((screen.getByPlaceholderText('Tell Frontend dev what to do now…') as HTMLTextAreaElement).disabled).toBe(true)
    expect(screen.getByText("Your role can't start runs.")).toBeTruthy()
  })
})
