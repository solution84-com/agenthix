import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreateTaskModal } from '../CreateTaskModal'
import { TaskScheduleEditor } from '../TaskScheduleEditor'
import { NewTaskRow } from '../NewTaskRow'
import { OverflowMenu } from '../OverflowMenu'
import { TasksList } from '../TasksList'
import type { ToolTask } from '../taskGroups'

const boards = [{
  id: 'b1', name: 'Sprint', status: 'ACTIVE',
  stages: [
    { name: 'todo', label: 'To Do', status: 'TODO' as const },
    { name: 'doing', label: 'Doing', status: 'IN_PROGRESS' as const },
  ],
}]

describe('CreateTaskModal', () => {
  const base = { open: true, onClose: () => {}, projectId: 'p1', agents: [], boards }

  it('says why creating failed and stays open', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockRejectedValue(new Error('That model is not allowed here. Nothing was changed.'))
    render(<CreateTaskModal {...base} onClose={onClose} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Ship it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }))
    expect((await screen.findByRole('alert')).textContent).toContain('model is not allowed')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('opens with the default board and its first To Do column chosen, so the task has a column', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateTaskModal {...base} defaultBoardId="b1" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/Title/), { target: { value: 'Ship it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ boardId: 'b1', stage: 'todo' })
  })

  it('forgets the last model choice when it is opened again', () => {
    const modelField = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
      <button type="button" onClick={() => onChange('opus')}>model:{value || 'none'}</button>
    )
    const props = { ...base, onSubmit: async () => {}, modelField }
    const { rerender } = render(<CreateTaskModal {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'model:none' }))
    expect(screen.getByRole('button', { name: 'model:opus' })).toBeTruthy()
    rerender(<CreateTaskModal {...props} open={false} />)
    rerender(<CreateTaskModal {...props} open />)
    expect(screen.getByRole('button', { name: 'model:none' })).toBeTruthy()
  })
})

describe('TaskScheduleEditor', () => {
  it('does not bring back a start time that was removed', async () => {
    const at = '2030-01-02T09:30:00.000Z'
    const props = { canEdit: true, automationOn: true, onSave: async () => {}, onClear: async () => {} }
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
  const task: ToolTask = {
    id: 't1', key: 'AB-1', title: 'Write', priority: 'LOW', status: 'TODO', runState: 'RUN_NONE', runStateReason: null,
    agent: null, board: null, columnLabel: null, project: null, waitsForAgent: false, startsAt: null,
    workingSince: null, doneAt: null, result: null, createdAt: '2030-01-01T00:00:00.000Z',
  }
  it('opens on Space as well as Enter', () => {
    const onOpen = vi.fn()
    render(<TasksList groups={{ needsYou: [], workingOn: [], upNext: [task] }} now={new Date()} onOpen={onOpen} onAction={() => {}} renderAssign={() => null} />)
    const row = screen.getAllByRole('button').find(b => b.textContent?.includes('Write'))!
    fireEvent.keyDown(row, { key: ' ' })
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })
})
