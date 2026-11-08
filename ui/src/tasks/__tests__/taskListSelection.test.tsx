/** Ticking lines on a task list (T4): a held touch starts it, the bar acts on what is ticked, a dialog picks one value. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TasksList } from '../TasksList'
import { TasksPickDialog, TasksSelectionBar } from '../TasksSelection'
import { TasksFieldsMenu } from '../TasksFieldsMenu'
import type { TaskListRow } from '../taskListTypes'

afterEach(() => { cleanup(); vi.useRealTimers() })

const row: TaskListRow = {
  id: 't1', key: 'WEB-21', number: 21, title: 'Footer overlaps on phones', priority: 'LOW', state: 'BACKLOG', executionState: null,
  type: { name: 'Bug', icon: 'bug', kind: 'CUSTOM' }, column: { id: 'c1', name: 'Reported' },
  project: { id: 'p1', key: 'WEB', name: 'Website relaunch' }, agent: null, runDetail: null, epic: null, sprint: null, due: null,
  late: false, fields: {}, updatedAt: '2026-11-04T10:00:00Z', createdAt: '2026-11-04T10:00:00Z', progress: null,
}

describe('a held touch on a line', () => {
  it('starts ticking with that line, and the tap that ends it does not open the task', () => {
    vi.useFakeTimers()
    const onLongPress = vi.fn()
    const onOpen = vi.fn()
    render(<TasksList rows={[row]} kind="project" now={new Date(2026, 10, 7)} onOpen={onOpen} emptyText="" selection={{ selected: new Set(), boxes: false, onToggle: vi.fn(), onLongPress }} />)
    const line = screen.getByRole('listitem')
    fireEvent.pointerDown(line, { pointerType: 'touch' })
    act(() => { vi.advanceTimersByTime(600) })
    expect(onLongPress).toHaveBeenCalledWith(row)
    fireEvent.pointerUp(line, { pointerType: 'touch' })
    fireEvent.click(screen.getByRole('button', { name: row.title }))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a mouse held down does not start it, and a short touch opens the task', () => {
    vi.useFakeTimers()
    const onLongPress = vi.fn()
    const onOpen = vi.fn()
    render(<TasksList rows={[row]} kind="project" now={new Date(2026, 10, 7)} onOpen={onOpen} emptyText="" selection={{ selected: new Set(), boxes: false, onToggle: vi.fn(), onLongPress }} />)
    const line = screen.getByRole('listitem')
    fireEvent.pointerDown(line, { pointerType: 'mouse' })
    act(() => { vi.advanceTimersByTime(600) })
    expect(onLongPress).not.toHaveBeenCalled()
    fireEvent.pointerDown(line, { pointerType: 'touch' })
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.pointerUp(line, { pointerType: 'touch' })
    fireEvent.click(screen.getByRole('button', { name: row.title }))
    expect(onOpen).toHaveBeenCalledWith(row)
  })
})

describe('the selection bar on a wide screen', () => {
  it('says how many are ticked, its actions outlined, a refused one greyed with why, and ✕ clears', () => {
    const onClear = vi.fn()
    const move = vi.fn()
    render(<TasksSelectionBar count={2} onClear={onClear} actions={[{ label: 'Move to To do', onSelect: move }, { label: 'Add to sprint…', onSelect: vi.fn(), disabledWhy: 'No sprint yet.' }]} />)
    const bar = screen.getByRole('toolbar', { name: '2 selected' })
    fireEvent.click(screen.getByRole('button', { name: 'Move to To do' }))
    expect(move).toHaveBeenCalled()
    const sprint = screen.getByRole('button', { name: 'Add to sprint…' }) as HTMLButtonElement
    expect(sprint.disabled).toBe(true)
    expect(sprint.title).toBe('No sprint yet.')
    expect(screen.getByRole('button', { name: 'Move to To do' }).className).toMatch(/border-border/)
    fireEvent.click(screen.getByRole('button', { name: 'Clear the selection' }))
    expect(onClear).toHaveBeenCalled()
    expect(bar.parentElement!.className).toMatch(/max-lg:hidden/)
  })
})

describe('the pick dialog', () => {
  it('needs a choice before its button, and gives null for the choice that clears', () => {
    const onPick = vi.fn()
    render(<TasksPickDialog title="Set the epic of 2 tasks" label="Epic" none="No epic" submit="Set epic" choices={[{ id: 'e1', name: 'Launch pages' }]} onPick={onPick} onClose={vi.fn()} />)
    const submit = screen.getByRole('button', { name: 'Set epic' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Epic', { selector: 'select' }), { target: { value: 'e1' } })
    fireEvent.click(submit)
    expect(onPick).toHaveBeenCalledWith('e1')
    fireEvent.change(screen.getByLabelText('Epic', { selector: 'select' }), { target: { value: '__none__' } })
    fireEvent.click(submit)
    expect(onPick).toHaveBeenLastCalledWith(null)
  })
})

describe('Fields ▾', () => {
  it('ticks the columns shown, the fixed ones then the custom fields', () => {
    const onColumns = vi.fn()
    render(<TasksFieldsMenu columns={['column', 'agent', 'due']} fields={[{ id: 'f1', name: 'Audience', options: [] }]} onColumns={onColumns} />)
    fireEvent.click(screen.getByRole('button', { name: /Fields/ }))
    const items = screen.getAllByRole('menuitemcheckbox')
    expect(items.map(i => [i.textContent, i.getAttribute('aria-checked')])).toEqual([
      ['Column', 'true'], ['Agent', 'true'], ['Due', 'true'], ['Sprint', 'false'], ['Priority', 'false'], ['Audiencesingle select', 'false'],
    ])
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Agent' }))
    expect(onColumns).toHaveBeenCalledWith(['column', 'due'])
  })
})
