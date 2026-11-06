// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.mock('../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))
vi.mock('../../../shared/components/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <div>{content}</div> }))

import { NewTaskForm, type NewTaskFormProps } from '../NewTaskForm'

afterEach(cleanup)

const boards = [{ id: 'b1', name: 'Sprint', columns: [{ name: 'todo', label: 'To do', status: 'TODO', order: 0 }] }]

function setup(over: Partial<NewTaskFormProps> = {}) {
  const props: NewTaskFormProps = {
    defaults: {}, agents: [{ id: 'a1', name: 'Dana' }], boards, epics: [{ id: 'e1', number: 3, title: 'Checkout' }],
    renderModel: () => <div>model picker</div>,
    renderWorkspace: () => <div>workspace</div>,
    onCreate: vi.fn().mockResolvedValue({ number: 9 }),
    onCreated: vi.fn(), onCancel: vi.fn(), ...over,
  }
  render(<NewTaskForm {...props} />)
  return props
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('the new task page', () => {
  it('shows the Model only once an agent is chosen, and the Column only with a board', () => {
    setup()
    expect(screen.queryByText('model picker')).toBeNull()
    expect(screen.queryByLabelText('Column')).toBeNull()
    type('Agent', 'a1')
    expect(screen.getByText('model picker')).toBeTruthy()
    type('Board', 'b1')
    expect((screen.getByLabelText('Column') as HTMLSelectElement).value).toBe('todo')
  })

  it('fills the epic from the address', () => {
    setup({ defaults: { epicId: 'e1' } })
    expect((screen.getByLabelText('Epic') as HTMLSelectElement).value).toBe('e1')
  })

  it('opens the new task when Create more is off', async () => {
    const p = setup()
    type('Title', 'Ship it')
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(p.onCreated).toHaveBeenCalledWith({ number: 9 }))
  })

  it('stays, fresh, when Create more is on', async () => {
    const p = setup()
    fireEvent.click(screen.getByLabelText('Create more'))
    type('Title', 'One')
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(p.onCreate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(''))
    expect(p.onCreated).not.toHaveBeenCalled()
  })

  it('says why it failed in a dialog, keeps what was typed, and tries again', async () => {
    const onCreate = vi.fn().mockRejectedValueOnce(new Error('That model is not allowed here. Nothing was changed.')).mockResolvedValue({ number: 4 })
    const p = setup({ onCreate })
    type('Title', 'Keep me')
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect((await screen.findByRole('alert')).textContent).toContain('not allowed')
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Keep me')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(p.onCreated).toHaveBeenCalledWith({ number: 4 }))
    expect(onCreate).toHaveBeenCalledTimes(2)
  })

  it('does not create without a title', () => {
    setup()
    expect((screen.getByRole('button', { name: 'Create task' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
