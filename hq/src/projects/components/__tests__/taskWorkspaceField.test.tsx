// @vitest-environment jsdom
/** A new task's workspace (live preview spec, *Which work is code work*): code work is not left in the project's files by accident. */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const answers = vi.hoisted(() => ({ value: undefined as unknown }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: answers.value }),
  getTaskWorkspaces: 'getTaskWorkspaces',
}))

import { TaskWorkspaceField, TaskWorkspaceHint, defaultTaskWorkspace, taskWorkspaceHint } from '../TaskWorkspaceField'

const shop = { id: 'w1', name: 'shop-app', git: true }
const docs = { id: 'w2', name: 'docs', git: false }
const site = { id: 'w3', name: 'site', git: true }

describe("a new task's workspace", () => {
  it("is the project's only code workspace until the person chooses", () => {
    expect(defaultTaskWorkspace({ current: null, workspaces: [docs, shop] })).toBe('w1')
    expect(defaultTaskWorkspace({ current: null, workspaces: [shop, site] })).toBe('')
    expect(defaultTaskWorkspace({ current: null, workspaces: [docs] })).toBe('')
    expect(defaultTaskWorkspace(undefined)).toBe('')
  })

  it('says what the choice means when the project has code workspaces', () => {
    const choices = { current: null, workspaces: [docs, shop] }
    expect(taskWorkspaceHint(choices, 'w1')).toBe('Its runs work on a branch of their own in shop-app, which you merge into main.')
    expect(taskWorkspaceHint(choices, '')).toBe("This task's runs don't work on a branch. If it changes code, choose shop-app.")
    expect(taskWorkspaceHint(choices, 'w2')).toBe("docs has no Git, so this task's runs don't work on a branch. If it changes code, choose shop-app.")
    expect(taskWorkspaceHint({ current: null, workspaces: [shop, site] }, '')).toContain('choose the workspace with Git it is for')
    expect(taskWorkspaceHint({ current: null, workspaces: [docs] }, '')).toBeNull()
  })

  it('the form shows the only code workspace chosen, and keeps what the person chooses instead', () => {
    answers.value = { current: null, workspaces: [docs, shop] }
    const onChange = vi.fn()
    const { rerender } = render(<TaskWorkspaceField projectId="p1" value={undefined} onChange={onChange} />)
    expect((screen.getByRole('combobox', { name: 'Workspace' }) as HTMLSelectElement).value).toBe('w1')
    expect(screen.getByTestId('task-workspace-hint').textContent).toContain('branch of their own in shop-app')
    fireEvent.change(screen.getByRole('combobox', { name: 'Workspace' }), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(null)
    rerender(<TaskWorkspaceField projectId="p1" value="" onChange={onChange} />)
    expect((screen.getByRole('combobox', { name: 'Workspace' }) as HTMLSelectElement).value).toBe('')
    expect(screen.getByTestId('task-workspace-hint').textContent).toContain('choose shop-app')
  })
})

describe("a task's own Workspace fact", () => {
  it('says the same words the create form does, for the workspace the task has', () => {
    answers.value = { current: 'w1', workspaces: [docs, shop] }
    const { rerender } = render(<TaskWorkspaceHint projectId="p1" taskId="t1" />)
    expect(screen.getByTestId('task-workspace-hint').textContent).toBe(taskWorkspaceHint({ current: 'w1', workspaces: [docs, shop] }, 'w1'))
    answers.value = { current: null, workspaces: [docs, shop] }
    rerender(<TaskWorkspaceHint projectId="p1" taskId="t1" />)
    expect(screen.getByTestId('task-workspace-hint').textContent).toContain('choose shop-app')
  })

  it('says nothing when the project has no code workspace', () => {
    answers.value = { current: null, workspaces: [docs] }
    render(<TaskWorkspaceHint projectId="p1" taskId="t1" />)
    expect(screen.queryByTestId('task-workspace-hint')).toBeNull()
  })
})
