import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TaskScheduleEditor } from '../TaskScheduleEditor'
import { NewTaskRow } from '../NewTaskRow'
import { OverflowMenu } from '../OverflowMenu'
import { TasksList } from '../TasksList'
import type { TaskListRow } from '../taskListTypes'

describe('TaskScheduleEditor', () => {
  it('does not bring back a start time that was removed', async () => {
    const at = '2030-01-02T09:30:00.000Z'
    const props = { canEdit: true, onSave: async () => {}, onClear: async () => {} }
    const { rerender } = render(<TaskScheduleEditor {...props} schedule={{ at, nextDueAt: at }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    const first = (screen.getByLabelText(/At/) as HTMLInputElement).value
    expect(first).not.toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Remove start time' }))
    await waitFor(() => expect(screen.queryByLabelText(/At/)).toBeNull())
    rerender(<TaskScheduleEditor {...props} schedule={{ at: null, nextDueAt: null }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Set a start time' }))
    expect((screen.getByLabelText(/At/) as HTMLInputElement).value).toBe('')
  })
})

describe('the quick-add box', () => {
  it('does not add while an input method is still composing', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<NewTaskRow onAdd={onAdd} onMoreDetails={() => {}} />)
    const box = screen.getByLabelText('New task title')
    fireEvent.change(box, { target: { value: 'にほん' } })
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    expect(onAdd).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledWith('にほん')
  })
})

describe('OverflowMenu', () => {
  it('shows the reason an action was refused', async () => {
    render(<OverflowMenu items={[{ label: 'Unlink', onSelect: () => Promise.reject(new Error('Only an admin may unlink. Nothing was changed.')) }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unlink' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Only an admin')
  })
})

describe('TasksList rows', () => {
  const row: TaskListRow = {
    id: 't1', key: 'AB-1', number: 1, title: 'Write', priority: 'LOW', state: 'BACKLOG', executionState: null,
    type: { name: 'Task', icon: 'task', kind: 'TASK' }, column: { id: null, name: 'Backlog' },
    project: { id: 'p1', key: 'AB', name: 'AB' }, agent: null, runDetail: null, epic: null, sprint: null, due: null, late: false,
    fields: {}, updatedAt: '2030-01-01T00:00:00.000Z', createdAt: '2030-01-01T00:00:00.000Z', progress: null,
  }
  it('opens from its title, a real button, so the keyboard reaches it as any button', () => {
    const onOpen = vi.fn()
    render(<TasksList rows={[row]} kind="project" now={new Date()} onOpen={onOpen} emptyText="None" />)
    fireEvent.click(screen.getByRole('button', { name: 'Write' }))
    expect(onOpen).toHaveBeenCalledWith(row)
  })
})
