// @vitest-environment jsdom
/** New task (TK1, D11, D12, N2): pick a type, start in Backlog or the column it was added from, a focused form. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import type { TaskState, TaskTypeView } from '@agenthix/core'

vi.mock('../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <div>{content}</div> }))

import { NewTaskForm, type NewTaskFormProps } from '../NewTaskForm'

afterEach(cleanup)

const STATES: TaskState[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE']
const type = (id: string, name: string, kind: TaskTypeView['kind'], names: string[]): TaskTypeView => ({
  id, projectId: 'p', name, icon: kind === 'EPIC' ? 'epic' : id === 'bug' ? 'bug' : 'task', kind, madeFromVersionId: null, archivedAt: null,
  columns: names.map((n, order) => ({ id: `${id}-${order}`, typeId: id, name: n, colour: 'neutral', order, state: STATES[order], defaultForState: true })),
})
const types = [
  type('task', 'Task', 'TASK', ['Backlog', 'To do', 'In progress', 'Done']),
  type('bug', 'Bug', 'CUSTOM', ['Reported', 'Triaged', 'Fixing', 'Verified']),
  type('epic', 'Epic', 'EPIC', ['Backlog', 'To do', 'In progress', 'Done']),
]

function setup(over: Partial<NewTaskFormProps> = {}) {
  const props: NewTaskFormProps = {
    defaults: {}, types, agents: [{ id: 'a1', name: 'Dana' }], epics: [{ id: 'e1', number: 3, title: 'Checkout' }],
    renderModel: () => <div>model picker</div>, renderWorkspace: () => <div>workspace field</div>, personName: 'sam',
    onCreate: vi.fn().mockResolvedValue({ number: 9 }),
    onCreated: vi.fn(), onCancel: vi.fn(), ...over,
  }
  render(<NewTaskForm {...props} />)
  return props
}

const type_ = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const details = () => within(screen.getByRole('complementary', { name: 'Details' }))

describe('the new task page', () => {
  it('picks Task first, and shows the column it starts in, not chosen: its type’s Backlog column', () => {
    setup()
    const picker = within(screen.getByRole('radiogroup', { name: 'Type' }))
    expect(picker.getAllByRole('radio').map(r => [r.textContent, r.getAttribute('aria-checked')])).toEqual([
      ['Task', 'true'], ['Bug', 'false'], ['Epic', 'false'],
    ])
    expect(details().getByTestId('new-task-column').textContent).toBe('Starts in Backlog')
    fireEvent.click(picker.getByRole('radio', { name: 'Bug' }))
    expect(details().getByTestId('new-task-column').textContent).toBe('Starts in Reported (Backlog)')
    expect(details().queryByLabelText('Column')).toBeNull()
  })

  it('starts in the column it was added from (N2)', () => {
    setup({ defaults: { columnId: 'bug-2' } })
    expect(screen.getByRole('radio', { name: 'Bug' }).getAttribute('aria-checked')).toBe('true')
    expect(details().getByTestId('new-task-column').textContent).toBe('Starts in Fixing (In progress)')
  })

  it('keeps the agent on an epic, to manage it, and leaves out what an epic never has (D12)', () => {
    setup()
    fireEvent.click(details().getByRole('button', { name: 'Agent: No agent' }))
    fireEvent.click(screen.getByRole('button', { name: /Dana/ }))
    expect(screen.getByText('model picker')).toBeTruthy()
    expect(details().getByLabelText('Starts')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Epic' }))
    expect(screen.queryByText('model picker')).toBeNull()
    expect(details().queryByLabelText('Starts')).toBeNull()
    expect(details().queryByLabelText('Epic')).toBeNull()
    expect(details().queryByText('workspace field')).toBeNull()
    expect(details().getByText('Dana')).toBeTruthy()
  })

  it('fills the epic from the address, and says who it is for', () => {
    setup({ defaults: { epicId: 'e1' } })
    expect((details().getByLabelText('Epic') as HTMLSelectElement).value).toBe('e1')
    expect(details().getByText('sam (you)')).toBeTruthy()
  })

  it('makes the task of the type picked, and opens it when Create more is off', async () => {
    const p = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Bug' }))
    type_('Title', 'Ship it')
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(p.onCreated).toHaveBeenCalledWith({ number: 9 }))
    expect(p.onCreate).toHaveBeenCalledWith(expect.objectContaining({ typeId: 'bug', columnId: '', title: 'Ship it' }))
  })

  it('stays, fresh, when Create more is on', async () => {
    const p = setup()
    fireEvent.click(screen.getByLabelText('Create more'))
    type_('Title', 'One')
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(p.onCreate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(''))
    expect(p.onCreated).not.toHaveBeenCalled()
  })

  it('says why it failed in a centred dialog, keeps what was typed, and tries again', async () => {
    const onCreate = vi.fn().mockRejectedValueOnce(new Error('That model is not allowed here. Nothing was changed.')).mockResolvedValue({ number: 4 })
    const p = setup({ onCreate })
    type_('Title', 'Keep me')
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect((await screen.findByRole('alert')).textContent).toContain('not allowed')
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Keep me')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(p.onCreated).toHaveBeenCalledWith({ number: 4 }))
    expect(onCreate).toHaveBeenCalledTimes(2)
  })

  it('has Cancel and its one filled button, Create task, in the header, and Details as a task has them', () => {
    setup()
    const header = within(screen.getByRole('banner', { name: 'New task' }))
    expect(header.getAllByRole('button').map(b => b.textContent)).toEqual(['Cancel', 'Create task'])
    expect(details().getAllByRole('heading').map(h => h.textContent)).toEqual(['Who', 'Plan', 'When', 'About'])
    expect(details().getByLabelText('Due')).toBeTruthy()
  })

  it('does not create without a title', () => {
    setup()
    expect((screen.getByRole('button', { name: 'Create task' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
