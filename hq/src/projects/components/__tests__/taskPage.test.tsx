// @vitest-environment jsdom
/** A task's page (T0, T9, T10): Now by state, the delete dialog, a task that is gone, an epic's progress, the ⋯ menu. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/tasks')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return {
    ...(await importOriginal<object>()), MoreHorizontal: icon, Check: icon, ChevronDown: icon,
    ClipboardList: icon, Diamond: icon, Bug: icon, Lightbulb: icon, LifeBuoy: icon,
  }
})

import { TaskNow, type TaskNowProps } from '../TaskNow'
import { TaskHeader } from '../TaskHeader'
import { TaskDeleteDialog, TaskGone } from '../TaskDeleteDialog'
import { EpicProgressBlock } from '../TaskEpic'
import { taskPageMenu, ALREADY_FIRST } from '../taskPageMenu'
import { EPIC_HAS_RUNS } from '../taskPlace'
import { taskPageWords, nowKind, latestRun, type PageRun, type PageTask } from '../taskPageState'

afterEach(() => cleanup())

const NOW = new Date(2026, 10, 6, 9, 15)
const run = (over: Partial<PageRun> = {}): PageRun => ({
  id: 'r2', number: 2, status: 'COMPLETED', agent: { name: 'Writer' },
  startedAt: new Date(2026, 10, 6, 9, 11).toISOString(), endedAt: new Date(2026, 10, 6, 9, 14).toISOString(),
  createdAt: new Date(2026, 10, 6, 9, 11).toISOString(), ...over,
})

function now(task: Partial<PageTask>, o: { runs?: PageRun[]; result?: string | null; over?: Partial<TaskNowProps> } = {}) {
  const t: PageTask = { runState: 'RUN_NONE', runStateReason: null, status: 'TODO', ...task }
  const words = taskPageWords(t, { hasPendingApproval: false, readOnly: false, runs: o.runs, now: NOW })
  const props: TaskNowProps = {
    kind: nowKind(words, t, latestRun(o.runs)), words, latest: latestRun(o.runs), result: o.result ?? null, agentName: 'Writer', now: NOW,
    approval: <div>the request card</div>, onDismiss: vi.fn(), onSeeRun: vi.fn(), renderMarkdown: s => <p>{s}</p>,
    ...o.over,
  }
  render(<TaskNow {...props} />)
  return props
}

describe('Now, one block by state', () => {
  it('holds the request card while an okay waits', () => {
    now({ runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' })
    expect(screen.getByText('the request card')).toBeTruthy()
  })

  it('shows the live run and points down to it', () => {
    const p = now({ runState: 'RUN_ACTIVE' }, { runs: [run({ status: 'RUNNING', endedAt: null })] })
    expect(screen.getByText('Run 2 · running · 4 min')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'See Run 2 in Runs' }))
    expect(p.onSeeRun).toHaveBeenCalled()
  })

  it('shows a failure with Dismiss beside it, and leaves Run again to the header', () => {
    const p = now({ runState: 'RUN_FAILED', runStateReason: 'The model provider was still overloaded after 3 tries' }, { runs: [run({ number: 3, status: 'FAILED' })] })
    expect(screen.getByText('Run 3 failed · The model provider was still overloaded after 3 tries')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(p.onDismiss).toHaveBeenCalled()
  })

  it('says a denied request in plain words, never the record\'s', () => {
    now({ runState: 'RUN_BLOCKED', runStateReason: 'manifest rejected — awaiting human review' }, { runs: [run({ status: 'FAILED' })] })
    expect(screen.getByText('Run 2 failed · Request denied — run again to retry')).toBeTruthy()
    expect(screen.queryByText(/manifest/)).toBeNull()
  })

  it('offers no Run again where the run cannot be started again, and says why', () => {
    now({ runState: 'RUN_BLOCKED', runStateReason: 'lost access' }, { runs: [run({ status: 'FAILED' })], over: { noRetryReason: 'Its person lost access' } })
    expect(screen.queryByRole('button', { name: 'Run again' })).toBeNull()
    expect(screen.getByText('Its person lost access')).toBeTruthy()
  })

  it('shows the latest result, labelled with who, which run and when', () => {
    now({}, { runs: [run()], result: 'All footer links on the blog pages work.' })
    expect(screen.getByText('All footer links on the blog pages work.')).toBeTruthy()
    expect(screen.getByText('Writer · Run 2 · finished 09:14')).toBeTruthy()
  })

  it('says so when the latest run stated no result, never an older one', () => {
    now({}, { runs: [run()], result: null })
    expect(screen.getByText('It finished without saying what came of it.')).toBeTruthy()
  })

  it('says no run yet on a task never run', () => {
    now({})
    expect(screen.getByText(/^No run yet\. Run starts Writer on it/)).toBeTruthy()
  })

  it('says why a waiting task has not started', () => {
    now({ runState: 'RUN_QUEUED' }, { over: { waitText: '2nd in line for Writer' } })
    expect(screen.getByText('Waiting')).toBeTruthy()
    expect(screen.getByText('2nd in line for Writer')).toBeTruthy()
  })
})

describe('the header', () => {
  const typeChoices = [
    { id: 'task', label: 'Task', icon: 'task', current: false },
    { id: 'bug', label: 'Bug', icon: 'bug', current: true },
    { id: 'epic', label: 'Epic', icon: 'epic', current: false, hint: EPIC_HAS_RUNS, disabledWhy: EPIC_HAS_RUNS },
  ]
  const columnChoices = [
    { id: 'rep', label: 'Reported', current: false }, { id: 'tri', label: 'Triaged', current: true }, { id: 'fix', label: 'Fixing', current: false },
  ]

  it('shows the key, the type and the column by name, the agent and the run in words, and its buttons', () => {
    render(
      <TaskHeader
        taskKey="WEB-14" type={{ name: 'Bug', icon: 'bug', choices: typeChoices, onChoose: vi.fn() }}
        column={{ name: 'Triaged', choices: columnChoices, onChoose: vi.fn() }}
        agent={{ name: 'Writer', state: 'NOT_STARTED', words: 'Not started' }}
        talk={<button>Talk about this task</button>} primary={<button>Run</button>} menu={<button>More actions</button>}
      />,
    )
    const header = within(screen.getByRole('banner', { name: 'Task' }))
    expect(header.getByText('WEB-14')).toBeTruthy()
    expect(header.getByTestId('task-type').textContent).toBe('Bug')
    expect(header.getByTestId('task-column').textContent).toBe('Triaged')
    expect(header.getByTestId('task-run-words').textContent).toBe('Writer · Not started')
    expect(header.queryByText('To do')).toBeNull()
    expect(header.getAllByRole('button').map(b => b.textContent)).toEqual(['Bug', 'Triaged', 'Talk about this task', 'Run', 'More actions'])
  })

  it('opens the type’s columns from the column chip, and moves the task to the one chosen', () => {
    const onChoose = vi.fn()
    render(<TaskHeader taskKey="WEB-14" column={{ name: 'Triaged', choices: columnChoices, onChoose }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Column: Triaged' }))
    const menu = within(screen.getByRole('menu', { name: 'Column' }))
    expect(menu.getAllByRole('menuitemradio').map(i => [i.textContent, i.getAttribute('aria-checked')])).toEqual([
      ['Reported', 'false'], ['Triaged', 'true'], ['Fixing', 'false'],
    ])
    fireEvent.click(menu.getByRole('menuitemradio', { name: 'Fixing' }))
    expect(onChoose).toHaveBeenCalledWith('fix')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('greys Epic in the type chip on a task that has runs, with why', () => {
    const onChoose = vi.fn()
    render(<TaskHeader taskKey="WEB-14" type={{ name: 'Bug', icon: 'bug', choices: typeChoices, onChoose }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Type: Bug' }))
    const epic = screen.getByRole('menuitemradio', { name: /Epic/ }) as HTMLButtonElement
    expect(epic.disabled).toBe(true)
    expect(epic.title).toBe(EPIC_HAS_RUNS)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Task' }))
    expect(onChoose).toHaveBeenCalledWith('task')
  })

  it('draws the chips as words where the person may not change them, and an epic as never run', () => {
    render(<TaskHeader taskKey="WEB-20" type={{ name: 'Epic', icon: 'epic', choices: [] }} column={{ name: 'In progress', choices: [] }} note="never run" />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByTestId('task-column').textContent).toBe('In progress')
    expect(screen.getByText('never run')).toBeTruthy()
  })

  it('shows the key alone while the task loads', () => {
    render(<TaskHeader taskKey="WEB-14" loading primary={<button>Run</button>} />)
    expect(screen.getByRole('banner', { name: 'Task' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('Delete… and a task that is gone', () => {
  it('names the task and what goes with it, offers archiving instead, then deletes', () => {
    const on = { onCancel: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn() }
    render(<TaskDeleteDialog open taskKey="WEB-7" title="Find out why two pages load slowly" comments={1} runs={1} conversation {...on} />)
    const dialog = within(screen.getByRole('dialog', { name: 'Delete WEB-7?' }))
    expect(dialog.getByText('“Find out why two pages load slowly” goes, with:')).toBeTruthy()
    expect(dialog.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'its 1 comment and its files', 'its 1 run and what the run recorded', 'its conversation',
    ])
    expect(dialog.getByText(/This can’t be undone\. To keep it out of the way instead,/)).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: 'archive it' }))
    expect(on.onArchive).toHaveBeenCalled()
    fireEvent.click(dialog.getByRole('button', { name: 'Delete task' }))
    expect(on.onDelete).toHaveBeenCalled()
  })

  it('says a deleted or missing task does not exist any more, with the way back', () => {
    const onBack = vi.fn()
    render(<TaskGone onBack={onBack} />)
    expect(screen.getByRole('heading', { name: 'This task doesn’t exist any more' })).toBeTruthy()
    expect(screen.getByText('It was deleted, or the address is wrong.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back to Tasks' }))
    expect(onBack).toHaveBeenCalled()
  })
})

describe('an epic', () => {
  it('shows its progress by task state where a task has Now, and when it is due; never a run count', () => {
    render(<EpicProgressBlock progress={{ done: 3, total: 6, inProgress: 2, todo: 1, backlog: 0 }} due="2026-11-20" now={NOW} />)
    expect(screen.getByRole('img', { name: '3 of 6 done' })).toBeTruthy()
    expect(screen.getByText('3 of 6 done')).toBeTruthy()
    expect(screen.getByText('2 in progress · 1 to do · due 20 Nov, 14 days')).toBeTruthy()
    expect(screen.queryByText(/running|needs you/)).toBeNull()
  })

})

describe('⋯ on a task page', () => {
  const on = { moveToTop: vi.fn(), moveToBottom: vi.fn(), copyLink: vi.fn(), archive: vi.fn(), unarchive: vi.fn(), runAgain: vi.fn(), askDelete: vi.fn() }
  const base = { canChange: true, archived: false, runAgain: false, first: false, last: false }

  it('holds Move to top and Move to bottom, Copy link and Archive, then Delete…, last and set apart; no type change', () => {
    const items = taskPageMenu(base, on)
    expect(items.map(i => i.label)).toEqual(['Move to top', 'Move to bottom', 'Copy link', 'Archive', 'Delete…'])
    expect(items[2]).toMatchObject({ separatorBefore: true })
    expect(items[4]).toMatchObject({ danger: true, separatorBefore: true })
    expect(items.some(i => /epic/i.test(i.label))).toBe(false)
  })

  it('greys Move to top on the first task, with why', () => {
    expect(taskPageMenu({ ...base, first: true }, on)[0].disabledReason).toBe(ALREADY_FIRST)
  })

  it('offers Unarchive on an archived task, and Run again on a done one', () => {
    expect(taskPageMenu({ ...base, archived: true, runAgain: true }, on).map(i => i.label))
      .toEqual(['Run again', 'Move to top', 'Move to bottom', 'Copy link', 'Unarchive', 'Delete…'])
  })

  it('gives someone who may only read Copy link alone', () => {
    expect(taskPageMenu({ ...base, canChange: false }, on).map(i => i.label)).toEqual(['Copy link'])
  })
})

describe('the task header’s agent (D18)', () => {
  it('rings the agent’s avatar with the run and keeps the state in words beside it', () => {
    render(<TaskHeader taskKey="WEB-1" agent={{ name: 'Writer', state: 'NEEDS_YOU', words: 'Needs your okay' }} />)
    expect(screen.getByRole('img', { name: 'Writer · Needs you' }).getAttribute('data-run')).toBe('NEEDS_YOU')
    expect(screen.getByTestId('task-run-words').textContent).toBe('Writer · Needs your okay')
  })
})
