// @vitest-environment jsdom
/** The Boards tool's views (every screen reviewed spec §3): the list, a board's box, Finish sprint, New board, the columns. */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'

// ui resolves its own copy of lucide-react (see tasksToolViews.test.tsx); its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/tasks')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, () => {
  const icon = () => null
  return {
    Plus: icon, Search: icon, ChevronLeft: icon, MoreHorizontal: icon, Send: icon, ChevronDown: icon, ChevronRight: icon,
    Loader2: icon, Check: icon, Copy: icon, Bot: icon, Sparkles: icon, CheckCircle: icon, XCircle: icon, Columns3: icon, ChartGantt: icon,
  }
})
import {
  BoardsList, BoardBox, FinishSprintForm, ModeSwitch, NewBoardForm, EditColumnsModal, type SprintInfo,
} from '@agenthix/ui/board'
import { boardItem, card, COLUMNS } from './boardFixtures'

const SPRINT: SprintInfo = {
  id: 's12', number: 12, name: 'Pricing push', label: 'Sprint 12 · Pricing push',
  startDate: '2026-10-06T00:00:00Z', finishDate: '2026-10-20T00:00:00Z', finishedAt: null, daysLeft: 9,
}

describe('the list @SC-557', () => {
  const boards = [
    boardItem({ id: 'pt', name: 'Project Tasks', kind: 'PROJECT_TASKS' }),
    boardItem({ id: 'p', name: 'Product', kind: 'SPRINTS', needsYouCount: 1, currentSprint: SPRINT }),
    boardItem({ id: 'bugs', name: 'Bugs', needsYouCount: 3 }),
  ]
  const show = (over = {}) => {
    const props = { boards, archivedCount: 1, showingArchived: false, onOpen: vi.fn(), onNew: vi.fn(), onShowArchived: vi.fn(), onShowActive: vi.fn(), ...over }
    render(<BoardsList {...props} />)
    return props
  }

  it('lists Project Tasks first with its Default marker, and a sprint board with its sprint and days left', () => {
    show()
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('Project Tasks')).toBeTruthy()
    expect(within(rows[0]).getByText('Default')).toBeTruthy()
    expect(within(rows[1]).getByText('Pricing push')).toBeTruthy()
    expect(within(rows[1]).getByText('Sprint 12')).toBeTruthy()
    expect(within(rows[1]).getByText(/9 days left/)).toBeTruthy()
    expect(within(rows[1]).getByText(/Backlog 2 · To do 1 · In progress 1 · Done 1/)).toBeTruthy()
  })

  it('says how many need a person on a board\'s first line, and nothing when none do', () => {
    show()
    expect(screen.getByText('1 needs you')).toBeTruthy()
    expect(screen.getByText('3 need you')).toBeTruthy()
    expect(within(screen.getAllByRole('listitem')[0]).queryByText(/need/)).toBeNull()
  })

  it('has Archived as a button with its count, and ＋ New in the header', () => {
    const props = show()
    fireEvent.click(screen.getByRole('button', { name: /Archived/ }))
    expect(props.onShowArchived).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '＋ New' }))
    expect(props.onNew).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open Bugs' }))
    expect(props.onOpen).toHaveBeenCalledWith('bugs')
  })

  it('shows the archived boards with a way to restore them, and no ＋ New @SC-544', () => {
    const onUnarchive = vi.fn()
    show({ boards: [boardItem({ id: 'old', name: 'Launch', archivedAt: '2026-10-01T00:00:00Z' })], showingArchived: true, onUnarchive })
    expect(screen.queryByRole('button', { name: '＋ New' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }))
    expect(onUnarchive).toHaveBeenCalledWith('old')
  })
})

describe('a board\'s box', () => {
  it('shows the sprint with its dates and days left, Finish sprint and Rename sprint', () => {
    const onFinish = vi.fn()
    render(<BoardBox sprint={SPRINT} onFinish={onFinish} onRename={async () => {}} />)
    expect(screen.getByText(/6–20 Oct · 9 days left/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finish sprint' }))
    expect(onFinish).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Rename sprint' })).toBeTruthy()
  })

  it('renames the sprint in place @SC-550', async () => {
    const onRename = vi.fn(async () => {})
    render(<BoardBox sprint={SPRINT} onFinish={() => {}} onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename sprint' }))
    fireEvent.change(screen.getByLabelText('Sprint name'), { target: { value: 'Launch week' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('Launch week'))
  })

  it('lists the past sprints under ▾, each readable @SC-550', () => {
    const onViewSprint = vi.fn()
    const past = [{ ...SPRINT, id: 's11', number: 11, name: null, label: 'Sprint 11', finishedAt: '2026-10-06T00:00:00Z', taskCount: 8, doneCount: 5 }]
    render(<BoardBox sprint={SPRINT} pastSprints={past} onViewSprint={onViewSprint} onOpenPast={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Past sprints' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Sprint 11/ }))
    expect(onViewSprint).toHaveBeenCalledWith('s11')
  })

  it('offers no Finish or Rename to someone who cannot change the board, such as a project Viewer @SC-549', () => {
    render(<BoardBox sprint={SPRINT} />)
    expect(screen.queryByRole('button', { name: 'Finish sprint' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rename sprint' })).toBeNull()
  })

  it('has no box on a board without sprints', () => {
    const { container } = render(<BoardBox sprint={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('switches between Columns and Timeline from the header, named even where only the icons show', () => {
    const onChange = vi.fn()
    render(<ModeSwitch mode="columns" onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Columns' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Timeline' }))
    expect(onChange).toHaveBeenCalledWith('timeline')
  })
})

describe('Finish sprint, in place @SC-551', () => {
  const form = (onFinish = vi.fn(async () => {})) => {
    render(<FinishSprintForm sprint={SPRINT} doneCount={4} unfinishedCount={10} lengthDays={14} onFinish={onFinish} onCancel={() => {}} />)
    return onFinish
  }

  it('says what stays recorded and offers the two destinations with nothing chosen, the button disabled', () => {
    form()
    expect(screen.getByText(/4 done/)).toBeTruthy()
    expect(screen.getByText(/stay recorded in Sprint 12 · Pricing push/)).toBeTruthy()
    expect(screen.getByText('10 not done go to')).toBeTruthy()
    expect(screen.getByRole('radio', { name: /The next sprint/ }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('radio', { name: /The Backlog/ }).getAttribute('aria-checked')).toBe('false')
    expect((screen.getByRole('button', { name: 'Finish sprint' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables Finish sprint only once a destination is chosen, and sends that one', async () => {
    const onFinish = form()
    fireEvent.click(screen.getByRole('radio', { name: /The Backlog/ }))
    const button = screen.getByRole('button', { name: 'Finish sprint' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith('backlog'))
  })

  it('shows a refusal instead of closing', async () => {
    form(vi.fn(async () => { throw new Error('Someone finished it already') }))
    fireEvent.click(screen.getByRole('radio', { name: /The next sprint/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish sprint' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Someone finished it already')
  })
})

describe('New board, in place @SC-558', () => {
  it('asks for a name, Workflow or Sprints, and columns from a template, and waits for a name', async () => {
    const onCreate = vi.fn(async () => {})
    render(<NewBoardForm templates={[{ id: 'tpl1', name: 'Issues', description: 'Reported · Fixing · Fixed' }]} onCreate={onCreate} onCancel={() => {}} />)
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Board name'), { target: { value: 'Bugs' } })
    fireEvent.click(screen.getByRole('radio', { name: /Sprints/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Issues/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name: 'Bugs', kind: 'SPRINTS', templateId: 'tpl1' }))
  })
})

describe('Edit columns @SC-561', () => {
  it('refuses a column named Backlog, which every board has already @SC-542', () => {
    const onSave = vi.fn(async () => {})
    render(<EditColumnsModal columns={COLUMNS} taskCountByColumn={{}} onSave={onSave} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Column 1 name'), { target: { value: 'Backlog' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert').textContent).toContain('Backlog')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('will not remove a column that still holds tasks', () => {
    render(<EditColumnsModal columns={COLUMNS} taskCountByColumn={{ doing: 2 }} onSave={async () => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove In progress' }))
    expect(screen.getByRole('alert').textContent).toContain('2 tasks')
    expect(screen.getByLabelText('Column 2 name')).toBeTruthy()
  })

  it('saves the columns in the order and with the states chosen', async () => {
    const onSave = vi.fn(async () => {})
    render(<EditColumnsModal columns={COLUMNS} taskCountByColumn={{}} onSave={onSave} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move To do down' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = (onSave.mock.calls[0] as unknown as [{ name: string; order: number }[]])[0]
    expect(saved.map(c => [c.name, c.order])).toEqual([['doing', 0], ['todo', 1], ['done', 2]])
  })
})
