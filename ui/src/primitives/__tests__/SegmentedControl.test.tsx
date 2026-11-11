import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SegmentedControl, type SegmentOption } from '../SegmentedControl'

afterEach(cleanup)

const TYPES: SegmentOption<'task' | 'epic' | 'bug'>[] = [
  { value: 'task', label: 'Task' },
  { value: 'epic', label: 'Epic' },
  { value: 'bug', label: 'Bug' },
]

function Harness({ options = TYPES, kind }: { options?: SegmentOption<'task' | 'epic' | 'bug'>[]; kind?: 'radio' | 'tabs' }) {
  const [value, setValue] = useState<'task' | 'epic' | 'bug'>('task')
  return <SegmentedControl label="Type" options={options} value={value} onChange={setValue} kind={kind} />
}

describe('SegmentedControl, one of a small set @SC-1902', () => {
  it('is a radio group whose chosen piece is checked, and a click chooses another', () => {
    const onChange = vi.fn()
    render(<SegmentedControl label="Type" options={TYPES} value="task" onChange={onChange} />)
    const group = screen.getByRole('radiogroup', { name: 'Type' })
    expect(within(group).getByRole('radio', { name: 'Task' }).getAttribute('aria-checked')).toBe('true')
    expect(within(group).getByRole('radio', { name: 'Epic' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(within(group).getByRole('radio', { name: 'Epic' }))
    expect(onChange).toHaveBeenCalledWith('epic')
  })

  it('takes one Tab stop, on the chosen piece', () => {
    render(<Harness />)
    expect(screen.getByRole('radio', { name: 'Task' }).tabIndex).toBe(0)
    expect(screen.getByRole('radio', { name: 'Epic' }).tabIndex).toBe(-1)
    expect(screen.getByRole('radio', { name: 'Bug' }).tabIndex).toBe(-1)
  })

  it('moves the choice and the focus with the arrow keys, round the ends, and to the ends with Home and End', () => {
    render(<Harness />)
    const task = screen.getByRole('radio', { name: 'Task' })
    task.focus()
    fireEvent.keyDown(task, { key: 'ArrowRight' })
    const epic = screen.getByRole('radio', { name: 'Epic' })
    expect(epic.getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(epic)
    fireEvent.keyDown(epic, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Bug' }), { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'Task' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Task' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('radio', { name: 'Bug' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Bug' }), { key: 'Home' })
    expect(screen.getByRole('radio', { name: 'Task' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Task' }), { key: 'End' })
    expect(screen.getByRole('radio', { name: 'Bug' }).getAttribute('aria-checked')).toBe('true')
  })

  it('passes over a piece that is disabled', () => {
    render(<Harness options={[TYPES[0], { ...TYPES[1], disabled: true }, TYPES[2]]} />)
    const epic = screen.getByRole('radio', { name: 'Epic' }) as HTMLButtonElement
    expect(epic.disabled).toBe(true)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Task' }), { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'Bug' }).getAttribute('aria-checked')).toBe('true')
  })

  it('disabled as a whole, says so and changes nothing by click or key', () => {
    const onChange = vi.fn()
    render(<SegmentedControl label="Type" options={TYPES} value="task" onChange={onChange} disabled />)
    const group = screen.getByRole('radiogroup', { name: 'Type' })
    expect(group.getAttribute('aria-disabled')).toBe('true')
    for (const r of within(group).getAllByRole('radio')) expect((r as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(group).getByRole('radio', { name: 'Epic' }))
    fireEvent.keyDown(within(group).getByRole('radio', { name: 'Task' }), { key: 'ArrowRight' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('as tabs, is a tab list whose chosen tab is selected, with the same keys', () => {
    render(<Harness kind="tabs" />)
    const list = screen.getByRole('tablist', { name: 'Type' })
    expect(within(list).getByRole('tab', { name: 'Task' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(within(list).getByRole('tab', { name: 'Task' }), { key: 'ArrowRight' })
    expect(within(list).getByRole('tab', { name: 'Epic' }).getAttribute('aria-selected')).toBe('true')
  })

  it('can be named by a label elsewhere on the page', () => {
    render(<><span id="nt-type">Type of task</span><SegmentedControl labelledBy="nt-type" options={TYPES} value="task" onChange={() => {}} /></>)
    expect(screen.getByRole('radiogroup', { name: 'Type of task' })).toBeTruthy()
  })
})

describe('a piece refused for a reason @SC-1902 @SC-1907', () => {
  const REFUSED: SegmentOption<'task' | 'epic' | 'bug'>[] = [
    { value: 'task', label: 'Task' },
    { value: 'epic', label: 'Epic', refusal: { reason: 'Epics are off in this project.', title: 'Epics are off' } },
    { value: 'bug', label: 'Bug' },
  ]

  it('is greyed but not disabled, and says why on focus', () => {
    render(<Harness options={REFUSED} />)
    const epic = screen.getByRole('radio', { name: 'Epic' }) as HTMLButtonElement
    expect(epic.disabled).toBe(false)
    expect(epic.getAttribute('aria-disabled')).toBe('true')
    fireEvent.focus(epic)
    expect(screen.getByTestId('tooltip').textContent).toBe('Epics are off in this project.')
  })

  it('a press opens the dialog and does not choose it', () => {
    const onChange = vi.fn()
    render(<SegmentedControl label="Type" options={REFUSED} value="task" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Epic' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Epics are off' })).toBeTruthy()
  })

  it('the arrow keys reach it but only move the focus; the next arrow chooses past it', () => {
    render(<Harness options={REFUSED} />)
    const task = screen.getByRole('radio', { name: 'Task' })
    fireEvent.keyDown(task, { key: 'ArrowRight' })
    const epic = screen.getByRole('radio', { name: 'Epic' })
    expect(document.activeElement).toBe(epic)
    expect(task.getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(epic, { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'Bug' }).getAttribute('aria-checked')).toBe('true')
  })
})
