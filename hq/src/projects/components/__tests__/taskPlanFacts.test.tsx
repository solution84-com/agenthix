// @vitest-environment jsdom
/** A task's plan, its epic and an epic's milestone, set from its facts (every screen reviewed spec §3, adr-0098). */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// ui resolves its own copy of lucide-react (see tasksToolViews.test.tsx); its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/tasks')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, () => {
  const icon = () => null
  return {
    Plus: icon, Search: icon, ChevronLeft: icon, MoreHorizontal: icon, Send: icon, ChevronDown: icon, ChevronRight: icon,
    Loader2: icon, Check: icon, Copy: icon, Bot: icon, Sparkles: icon, CheckCircle: icon, XCircle: icon,
  }
})

const plan = vi.fn()
const data: Record<string, unknown> = {}
vi.mock('wasp/client/operations', () => ({
  getTasks: { name: 'getTasks' },
  getMilestones: { name: 'getMilestones' },
  updateTaskPlan: { name: 'updateTaskPlan' },
  useQuery: (op: { name: string }) => ({ data: data[op.name] }),
  useAction: () => plan,
}))
const canChange = { value: true }
vi.mock('../../../shared/hooks/useMayWork', () => ({
  useMayWork: () => canChange.value,
  VIEWER_CANNOT_WORK: 'You can view this project but not change its work',
}))

import { TaskPlanFacts } from '../TaskPlanFacts'

const base = { id: 't1', projectId: 'p1', project: { key: 'WEB' }, planStart: '2026-10-05T00:00:00.000Z', planFinish: '2026-10-09T00:00:00.000Z' }

beforeEach(() => {
  plan.mockReset().mockResolvedValue({})
  canChange.value = true
  data.getTasks = [
    { id: 'e1', number: 3, title: 'Pricing page', isEpic: true },
    { id: 'e2', number: 4, title: 'Onboarding', isEpic: true },
    { id: 't1', number: 9, title: 'This task', isEpic: false },
  ]
  data.getMilestones = [{ id: 'm1', name: 'Self-serve live' }]
})
afterEach(() => cleanup())

describe('TaskPlanFacts @SC-555', () => {
  it('shows the plan\'s dates and the epic a task belongs to', () => {
    render(<TaskPlanFacts task={{ ...base, epicId: 'e1' }} onChanged={vi.fn()} />)
    expect((screen.getByLabelText('Plan start') as HTMLInputElement).value).toBe('2026-10-05')
    expect((screen.getByLabelText('Plan finish') as HTMLInputElement).value).toBe('2026-10-09')
    const epic = screen.getByLabelText('Epic') as HTMLSelectElement
    expect(epic.value).toBe('e1')
    expect([...epic.options].map(o => o.text)).toEqual(['None', 'WEB-3 · Pricing page', 'WEB-4 · Onboarding'])
    expect(screen.queryByLabelText('Milestone')).toBeNull()
  })

  it('changes the dates, the epic, and takes the task out of its epic, through the plan', async () => {
    const onChanged = vi.fn()
    render(<TaskPlanFacts task={{ ...base, epicId: 'e1' }} onChanged={onChanged} />)
    fireEvent.change(screen.getByLabelText('Plan finish'), { target: { value: '2026-10-12' } })
    await waitFor(() => expect(plan).toHaveBeenLastCalledWith({ taskId: 't1', planFinish: '2026-10-12' }))
    fireEvent.change(screen.getByLabelText('Plan start'), { target: { value: '' } })
    await waitFor(() => expect(plan).toHaveBeenLastCalledWith({ taskId: 't1', planStart: null }))
    fireEvent.change(screen.getByLabelText('Epic'), { target: { value: 'e2' } })
    await waitFor(() => expect(plan).toHaveBeenLastCalledWith({ taskId: 't1', epicId: 'e2' }))
    fireEvent.change(screen.getByLabelText('Epic'), { target: { value: '' } })
    await waitFor(() => expect(plan).toHaveBeenLastCalledWith({ taskId: 't1', epicId: null }))
    expect(onChanged).toHaveBeenCalledTimes(4)
  })

  it('gives an epic a milestone instead of an epic', async () => {
    render(<TaskPlanFacts task={{ ...base, isEpic: true, milestoneId: null }} onChanged={vi.fn()} />)
    expect(screen.queryByLabelText('Epic')).toBeNull()
    fireEvent.change(screen.getByLabelText('Milestone'), { target: { value: 'm1' } })
    await waitFor(() => expect(plan).toHaveBeenLastCalledWith({ taskId: 't1', milestoneId: 'm1' }))
  })

  it('shows the server\'s refusal', async () => {
    plan.mockRejectedValue(new Error('A plan\'s finish date cannot be before its start date'))
    render(<TaskPlanFacts task={base} onChanged={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Plan finish'), { target: { value: '2026-10-01' } })
    expect((await screen.findByRole('alert')).textContent).toContain('cannot be before')
  })

  it('is read-only for someone who may not change the work', () => {
    canChange.value = false
    render(<TaskPlanFacts task={base} onChanged={vi.fn()} />)
    expect((screen.getByLabelText('Plan start') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByLabelText('Epic') as HTMLSelectElement).disabled).toBe(true)
  })
})
