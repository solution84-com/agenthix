// @vitest-environment jsdom
/** A task's Sprint and custom fields in Details (spec D4, D8, N1, N7): what can be chosen, what is greyed and why. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const sprint = (id: string, number: number, status: string) => ({ id, number, name: null, title: `Sprint ${number}`, status })
const SERIES = { current: sprint('s4', 4, 'current'), upcoming: [sprint('s5', 5, 'upcoming')], past: [sprint('s3', 3, 'past')], lengthDays: 14, mayPlanAhead: true }
const FIELDS = [{ id: 'f1', name: 'Launch stage', options: [{ id: 'o1', name: 'Design' }, { id: 'o2', name: 'Review' }] }]

const ops = vi.hoisted(() => ({ plan: vi.fn(() => Promise.resolve({})), takeOut: vi.fn(() => Promise.resolve({})), setValue: vi.fn(() => Promise.resolve([])) }))
vi.mock('wasp/client/operations', () => ({
  useAction: (a: unknown) => a,
  useQuery: (q: string) => ({ data: q === 'getProjectSprints' ? SERIES : q === 'getCustomFields' ? FIELDS : q === 'getTaskFieldValues' ? [{ fieldId: 'f1', optionId: 'o2' }] : undefined, refetch: vi.fn() }),
  getProjectSprints: 'getProjectSprints', getCustomFields: 'getCustomFields', getTaskFieldValues: 'getTaskFieldValues',
  addTasksToSprint: ops.plan, removeTasksFromSprint: ops.takeOut, setTaskFieldValue: ops.setValue,
}))
vi.mock('@agenthix/ui/tasks', () => ({ TaskFact: ({ label, children }: { label: string; children: React.ReactNode }) => <div><span>{label}</span>{children}</div> }))

import { EPIC_HAS_NO_SPRINT, FINISHED_SPRINT_KEEPS, TaskSprintFact } from '../TaskSprintFact'
import { TaskFieldFacts } from '../TaskFieldFacts'

afterEach(() => { cleanup(); vi.clearAllMocks() })

const change = (_what: string, work: () => Promise<unknown>) => { void work() }

describe("a task's Sprint", () => {
  it('offers None, the current sprint and those planned ahead, and plans the task into the one chosen', () => {
    render(<TaskSprintFact task={{ id: 't1', projectId: 'p1', sprintId: null }} canChange change={change} onChanged={vi.fn()} />)
    const select = screen.getByRole('combobox', { name: 'Sprint' }) as HTMLSelectElement
    expect([...select.options].map(o => o.text)).toEqual(['None', 'Sprint 4 (current)', 'Sprint 5'])
    fireEvent.change(select, { target: { value: 's5' } })
    expect(ops.plan).toHaveBeenCalledWith({ sprintId: 's5', taskIds: ['t1'] })
  })

  it('takes the task out with None', () => {
    render(<TaskSprintFact task={{ id: 't1', projectId: 'p1', sprintId: 's4' }} canChange change={change} onChanged={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Sprint' }), { target: { value: '' } })
    expect(ops.takeOut).toHaveBeenCalledWith({ projectId: 'p1', taskIds: ['t1'] })
  })

  it('keeps a task in a finished sprint, and never plans an epic, saying why', () => {
    render(<TaskSprintFact task={{ id: 't1', projectId: 'p1', sprintId: 's3' }} canChange change={change} onChanged={vi.fn()} />)
    const select = screen.getByRole('combobox', { name: 'Sprint' }) as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(select.value).toBe('s3')
    expect(select.parentElement?.parentElement?.getAttribute('title')).toBe(FINISHED_SPRINT_KEEPS)
    cleanup()
    render(<TaskSprintFact task={{ id: 'e1', projectId: 'p1', sprintId: null, isEpic: true }} canChange change={change} onChanged={vi.fn()} />)
    const epic = screen.getByRole('combobox', { name: 'Sprint' }) as HTMLSelectElement
    expect(epic.disabled).toBe(true)
    expect(epic.parentElement?.parentElement?.getAttribute('title')).toBe(EPIC_HAS_NO_SPRINT)
  })
})

describe("a task's custom fields", () => {
  it('shows one row per field with its value, — for none, and sets a value only in that field', () => {
    render(<TaskFieldFacts task={{ id: 't1' }} fields={FIELDS as never} values={[{ fieldId: 'f1', optionId: 'o2' }]} canChange change={change} onChanged={vi.fn()} />)
    const select = screen.getByRole('combobox', { name: 'Launch stage' }) as HTMLSelectElement
    expect(select.value).toBe('o2')
    expect([...select.options].map(o => o.text)).toEqual(['—', 'Design', 'Review'])
    fireEvent.change(select, { target: { value: '' } })
    expect(ops.setValue).toHaveBeenCalledWith({ taskId: 't1', fieldId: 'f1', optionId: null })
  })
})
