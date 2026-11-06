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
  return { ...(await importOriginal<object>()), MoreHorizontal: icon, Check: icon, ChevronDown: icon }
})

import { TaskNow, type TaskNowProps } from '../TaskNow'
import { TaskHeader } from '../TaskHeader'
import { TaskDeleteDialog, TaskGone } from '../TaskDeleteDialog'
import { EpicProgressBlock, EpicTasks, type EpicTaskRow } from '../TaskEpic'
import { taskPageMenu, EPIC_NEEDS_NO_AGENT } from '../taskPageMenu'
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
    approval: <div>the request card</div>, onRunAgain: vi.fn(), onDismiss: vi.fn(), onSeeRun: vi.fn(), renderMarkdown: s => <p>{s}</p>,
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
    fireEvent.click(screen.getByRole('button', { name: 'See Run 2 in Runs ↓' }))
    expect(p.onSeeRun).toHaveBeenCalled()
  })

  it('shows a failure with Run again and Dismiss beside it', () => {
    const p = now({ runState: 'RUN_FAILED', runStateReason: 'The model provider was still overloaded after 3 tries' }, { runs: [run({ number: 3, status: 'FAILED' })] })
    expect(screen.getByText('Run 3 failed · The model provider was still overloaded after 3 tries')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Run again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(p.onRunAgain).toHaveBeenCalled()
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
  it('shows the key, the state words, the column as a chip that moves the task, the agent, and its buttons', () => {
    const onChange = vi.fn()
    render(
      <TaskHeader
        taskKey="WEB-12" state={{ text: 'Running · 1 min', tone: 'live' }} agentName="Writer"
        column={{ value: 'todo', options: [{ value: '', label: 'Backlog' }, { value: 'todo', label: 'To do' }], onChange }}
        talk={<button>Talk about this task</button>} primary={<button>■ Stop</button>} menu={<button>More actions</button>}
      />,
    )
    const header = within(screen.getByRole('banner', { name: 'Task' }))
    expect(header.getByText('WEB-12')).toBeTruthy()
    expect(header.getByTestId('task-state').textContent).toBe('Running · 1 min')
    expect(header.getByText('Writer')).toBeTruthy()
    fireEvent.change(header.getByLabelText('Column'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
    expect(header.getAllByRole('button').map(b => b.textContent)).toEqual(['Talk about this task', '■ Stop', 'More actions'])
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
  it('shows its progress where a task has Now, with its milestone and the days left', () => {
    render(<EpicProgressBlock progress={{ done: 3, total: 5, needsYou: 1, running: 1, waiting: 1 }} milestone={{ name: 'Launch', date: '2026-11-20' }} now={NOW} />)
    expect(screen.getByRole('img', { name: '3 of 5 done' })).toBeTruthy()
    expect(screen.getByText('3 of 5 done')).toBeTruthy()
    expect(screen.getByText('1 needs you · 1 running · 1 waiting')).toBeTruthy()
    expect(screen.getByText('Launch · 20 Nov 2026')).toBeTruthy()
    expect(screen.getByText('14 days left')).toBeTruthy()
  })

  it('lists its open tasks first, folds the done ones, and adds a task to it', () => {
    const row = (over: Partial<EpicTaskRow>): EpicTaskRow => ({
      id: over.key ?? 'x', key: 'WEB-1', title: 'A task', columnLabel: 'To do', agentName: 'Writer', priority: 'MEDIUM',
      runState: 'RUN_NONE', runStateReason: null, status: 'TODO', ...over,
    })
    render(
      <MemoryRouter>
        <EpicTasks now={NOW} addHref="/projects/WEB/tasks/new?epic=e1" tasks={[
          row({ key: 'WEB-3', title: 'Done one', status: 'DONE' }),
          row({ key: 'WEB-2', title: 'Write the home page copy', runState: 'RUN_BLOCKED', runStateReason: 'Awaiting tool approval' }),
        ]} />
      </MemoryRouter>,
    )
    expect(within(screen.getByRole('list', { name: 'Open tasks' })).getByText('Write the home page copy')).toBeTruthy()
    expect(screen.queryByText('Done one')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /1 done · Show/ }))
    expect(screen.getByText('Done one')).toBeTruthy()
    expect(screen.getByRole('link', { name: '＋ Add a task to this epic' }).getAttribute('href')).toBe('/projects/WEB/tasks/new?epic=e1')
  })
})

describe('⋯ on a task page', () => {
  const on = { setEpic: vi.fn(), copyLink: vi.fn(), archive: vi.fn(), unarchive: vi.fn(), runAgain: vi.fn(), askDelete: vi.fn() }
  const base = { canChange: true, isEpic: false, hasAgent: false, archived: false, runAgain: false }

  it('holds Make this an epic, Copy link, Archive and Delete…, last and set apart', () => {
    const items = taskPageMenu(base, on)
    expect(items.map(i => i.label)).toEqual(['Make this an epic', 'Copy link', 'Archive', 'Delete…'])
    expect(items[3]).toMatchObject({ danger: true, separatorBefore: true })
  })

  it('greys Make this an epic on a task with an agent', () => {
    expect(taskPageMenu({ ...base, hasAgent: true }, on)[0].disabledReason).toBe(EPIC_NEEDS_NO_AGENT)
  })

  it('offers Not an epic on an epic, Unarchive on an archived task, and Run again on a done one', () => {
    expect(taskPageMenu({ ...base, isEpic: true, archived: true, runAgain: true }, on).map(i => i.label))
      .toEqual(['Run again', 'Not an epic', 'Copy link', 'Unarchive', 'Delete…'])
  })

  it('gives someone who may only read Copy link alone', () => {
    expect(taskPageMenu({ ...base, canChange: false }, on).map(i => i.label)).toEqual(['Copy link'])
  })
})
