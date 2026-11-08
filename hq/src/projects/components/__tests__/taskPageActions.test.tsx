// @vitest-environment jsdom
/** A task page's actions (TK1, D6, D12): the one filled button, Run ▾ and Run at…, and the phone top bar's ⋯. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/tasks')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), X: icon, ChevronDown: icon, Calendar: icon, CalendarClock: icon }
})

import { taskPrimary, taskPhoneActions, taskDetailsSummary, ASSIGN_AN_AGENT_FIRST, type TaskPageActionsInput } from '../TaskPageActions'
import { TaskRunAtDialog, startsText, localDateTime } from '../TaskRunAt'

afterEach(() => cleanup())

const input = (over: Partial<TaskPageActionsInput> = {}): TaskPageActionsInput => ({
  isEpic: false, button: 'run', busy: false, requestShown: false,
  talk: { label: 'Talk about this task', open: vi.fn() },
  menu: [{ label: 'Move to top', onSelect: vi.fn() }, { label: 'Copy link', onSelect: vi.fn() }, { label: 'Delete…', danger: true, onSelect: vi.fn() }],
  on: { runNow: vi.fn(), runAt: vi.fn(), stop: vi.fn(), review: vi.fn(), addTask: vi.fn() },
  ...over,
})

describe('the one filled button', () => {
  it('is Run ▾, opening Run now and Run at… a date and time', () => {
    const a = input()
    render(<>{taskPrimary(a)}</>)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    const menu = within(screen.getByRole('menu', { name: 'Run' }))
    expect(menu.getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Run now', 'Run at…a date and time'])
    fireEvent.click(menu.getByRole('menuitem', { name: /Run at/ }))
    expect(a.on.runAt).toHaveBeenCalled()
  })

  it('is greyed on a task with no agent, with why', () => {
    render(<>{taskPrimary(input({ refusal: ASSIGN_AN_AGENT_FIRST }))}</>)
    const run = screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement
    expect(run.disabled).toBe(true)
    expect(run.title).toBe(ASSIGN_AN_AGENT_FIRST)
  })

  it('is Add a task on an epic, never Run', () => {
    const a = input({ isEpic: true, button: null })
    render(<>{taskPrimary(a)}</>)
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add a task' }))
    expect(a.on.addTask).toHaveBeenCalled()
  })

  it('is Review while an okay waits, outlined while the request’s own Approve is on the page', () => {
    const a = input({ button: 'review' })
    render(<>{taskPrimary(a)}</>)
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(a.on.review).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Review' }).className).toContain('bg-accent')
    cleanup()
    render(<>{taskPrimary(input({ button: 'review', requestShown: true }))}</>)
    expect(screen.getByRole('button', { name: 'Review' }).className).not.toContain('bg-accent ')
  })
})

describe('the phone top bar’s ⋯', () => {
  it('leads with the main action, then Talk, then ⋯’s own items', () => {
    expect(taskPhoneActions(input()).map(a => a.label)).toEqual(['Run now', 'Run at…', 'Talk about this task', 'Move to top', 'Copy link', 'Delete…'])
    expect(taskPhoneActions(input({ isEpic: true, button: null, talk: { label: 'Talk about this epic', open: vi.fn() } })).map(a => a.label).slice(0, 2))
      .toEqual(['Add a task', 'Talk about this epic'])
    expect(taskPhoneActions(input({ button: 'stop' }))[0].label).toBe('Stop')
  })

  it('carries a refusal known in advance and a danger', () => {
    const rows = taskPhoneActions(input({ refusal: ASSIGN_AN_AGENT_FIRST }))
    expect(rows[0]).toMatchObject({ label: 'Run now', disabledWhy: ASSIGN_AN_AGENT_FIRST })
    expect(rows.find(r => r.label === 'Delete…')?.danger).toBe(true)
  })
})

describe('Details folded on a phone', () => {
  const NOW = new Date(2026, 10, 7)
  it('reads agent, sprint, priority and due; an epic’s says due', () => {
    expect(taskDetailsSummary({ priority: 'HIGH', planFinish: '2026-11-12', assignedAgent: { name: 'Writer' } }, 'Sprint 4', NOW)).toBe('Writer · Sprint 4 · High · 12 Nov')
    expect(taskDetailsSummary({ type: { kind: 'EPIC' }, priority: 'HIGH', planFinish: '2026-11-20', assignedAgent: { name: 'Writer' } }, null, NOW)).toBe('High · due 20 Nov')
  })
})

describe('Run at…', () => {
  it('says when the task starts, in the person’s own time', () => {
    const at = new Date(2026, 10, 12, 9, 0)
    expect(startsText(null)).toBe('Not scheduled')
    expect(localDateTime(at)).toBe('2026-11-12T09:00')
    expect(startsText(at, new Date(2026, 10, 7))).toBe('12 Nov, 09:00')
  })

  it('saves a time still to come, and clears one that is set', () => {
    const onSave = vi.fn()
    const onClear = vi.fn()
    const onClose = vi.fn()
    render(<TaskRunAtDialog open at={null} onClose={onClose} onSave={onSave} onClear={onClear} />)
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.queryByRole('button', { name: 'Clear' })).toBeNull()
    const save = dialog.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(dialog.getByLabelText('When it starts'), { target: { value: '2099-01-02T09:30' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(new Date('2099-01-02T09:30').toISOString())
    cleanup()
    render(<TaskRunAtDialog open at={new Date('2099-01-02T09:30')} onClose={onClose} onSave={onSave} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalled()
  })
})
