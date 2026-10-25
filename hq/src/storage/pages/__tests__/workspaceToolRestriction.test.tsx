// @vitest-environment jsdom
/**
 * Workspace tool restriction (SC-311), now the form behind "Change" in a workspace's facts: the toggle, the
 * always-injected task tools it pre-checks, and what it saves.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('wasp/client/operations', () => ({
  useAction: vi.fn(() => vi.fn()),
  setWorkspaceAllowedTools: 'setWorkspaceAllowedTools',
}))

import { useAction } from 'wasp/client/operations'
import { WorkspaceToolsForm } from '../WorkspaceToolsForm'

describe('workspace tool restriction @SC-311', () => {
  const actionMocks: Record<string, ReturnType<typeof vi.fn>> = {}

  function workspaceWith(allowedTools: string[] | null) {
    return { allowedTools }
  }

  let current: { allowedTools: string[] | null } = { allowedTools: null }
  function mockQueriesFor(workspace: { allowedTools: string[] | null }) {
    current = workspace
  }
  function renderForm() {
    render(React.createElement(WorkspaceToolsForm, { workspaceId: 'ws-1', allowedTools: current.allowedTools }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(actionMocks).forEach(k => delete actionMocks[k])
    ;(useAction as ReturnType<typeof vi.fn>).mockImplementation((action: string) => {
      if (!actionMocks[action]) actionMocks[action] = vi.fn()
      return actionMocks[action]
    })
  })

  it('renders the toggle off + explanation text when allowedTools is null', () => {
    mockQueriesFor(workspaceWith(null))
    renderForm()

    expect(screen.getByText(/A session working in this workspace can only use the tools checked here; sessions working elsewhere in the project are not affected/)).toBeTruthy()
    expect(screen.getByText('Restrict tools for sessions working in this workspace')).toBeTruthy()
    // Toggle is off: no checkbox list rendered
    expect(screen.queryByText('create_task')).toBeNull()
  })

  it('toggle on from null pre-checks the always-injected task tools, not nothing', () => {
    mockQueriesFor(workspaceWith(null))
    renderForm()

    fireEvent.click(screen.getByText('Restrict tools for sessions working in this workspace'))

    const checkbox = (name: string) => screen.getByText(name).closest('label')?.querySelector('input') as HTMLInputElement
    // Always-injected (spec H5/H6) — pre-checked so restricting doesn't default to
    // locking an agent out of its own task lifecycle.
    for (const name of ['ping', 'get_site_info', 'start_preview', 'stop_processes', 'fetch_my_queued_tasks', 'get_task_details', 'add_comment', 'run_task']) {
      expect(checkbox(name).checked).toBe(true)
    }
    // Not pre-checked — an ordinary configurable tool.
    expect(checkbox('create_task').checked).toBe(false)
  })

  it('toggle on from null then save (no further edits) persists exactly the pre-checked always-injected names', async () => {
    mockQueriesFor(workspaceWith(null))
    renderForm()

    fireEvent.click(screen.getByText('Restrict tools for sessions working in this workspace'))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(actionMocks['setWorkspaceAllowedTools']).toHaveBeenCalled())
    expect(actionMocks['setWorkspaceAllowedTools']).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      allowedTools: [
        'add_comment', 'fetch_my_queued_tasks', 'forget', 'get_site_info', 'get_task_details', 'list_workflows', 'ping',
        'propose_workflow', 'recall', 'remember', 'run_task', 'run_workflow', 'set_result', 'start_preview', 'stop_processes', 'workflow_run',
      ],
    })
  })

  it('toggle on from null + additionally check two tools + save → action called with the pre-checked defaults plus those two', async () => {
    mockQueriesFor(workspaceWith(null))
    renderForm()

    fireEvent.click(screen.getByText('Restrict tools for sessions working in this workspace'))
    fireEvent.click(screen.getByText('create_task'))
    fireEvent.click(screen.getByText('bash'))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(actionMocks['setWorkspaceAllowedTools']).toHaveBeenCalled())
    expect(actionMocks['setWorkspaceAllowedTools']).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      allowedTools: [
        'add_comment', 'bash', 'create_task', 'fetch_my_queued_tasks', 'forget', 'get_site_info', 'get_task_details',
        'list_workflows', 'ping', 'propose_workflow', 'recall', 'remember', 'run_task', 'run_workflow', 'set_result',
        'start_preview', 'stop_processes', 'workflow_run',
      ],
    })
  })

  it('toggle off + save → action called with null', async () => {
    mockQueriesFor(workspaceWith(['create_task']))
    renderForm()

    // Starts restricted (allowedTools is non-null) — flip the toggle off, then save.
    fireEvent.click(screen.getByText('Restrict tools for sessions working in this workspace'))
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(actionMocks['setWorkspaceAllowedTools']).toHaveBeenCalled())
    expect(actionMocks['setWorkspaceAllowedTools']).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      allowedTools: null,
    })
  })

  it("renders the checked state from a workspace whose allowedTools is ['create_task']", () => {
    mockQueriesFor(workspaceWith(['create_task']))
    renderForm()

    const createTaskCheckbox = screen.getByText('create_task').closest('label')?.querySelector('input') as HTMLInputElement
    const bashCheckbox = screen.getByText('bash').closest('label')?.querySelector('input') as HTMLInputElement
    expect(createTaskCheckbox.checked).toBe(true)
    expect(bashCheckbox.checked).toBe(false)
  })

  // ── [] is a distinct, deliberate state from null — the pre-check gate only fires
  //    for null, never for an already-saved empty list ─────────────────────────────

  it('a workspace with allowedTools: [] renders the toggle ON with nothing checked (no default injection)', () => {
    mockQueriesFor(workspaceWith([]))
    renderForm()

    const checkbox = (name: string) => screen.getByText(name).closest('label')?.querySelector('input') as HTMLInputElement
    for (const name of ['ping', 'get_site_info', 'start_preview', 'fetch_my_queued_tasks', 'get_task_details', 'add_comment', 'run_task', 'create_task']) {
      expect(checkbox(name).checked).toBe(false)
    }
  })

  it('toggling off then on again on a workspace with allowedTools: [] does not inject the always-injected defaults', () => {
    mockQueriesFor(workspaceWith([]))
    renderForm()

    fireEvent.click(screen.getByText('Restrict tools for sessions working in this workspace')) // off
    fireEvent.click(screen.getByText('Restrict tools for sessions working in this workspace')) // on again

    const checkbox = (name: string) => screen.getByText(name).closest('label')?.querySelector('input') as HTMLInputElement
    for (const name of ['ping', 'fetch_my_queued_tasks', 'run_task']) {
      expect(checkbox(name).checked).toBe(false)
    }
  })

  // ── Error surfacing — a rejected save must be visible, not silently absorbed ────

  it('shows the save error when setWorkspaceAllowedTools rejects (catalogue validation / role floor)', async () => {
    mockQueriesFor(workspaceWith(['create_task']))
    actionMocks['setWorkspaceAllowedTools'] = vi.fn().mockRejectedValue(new Error('unknown tool name: read_fil'))
    renderForm()

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(screen.getByText('unknown tool name: read_fil')).toBeTruthy())
  })

  it('offers no way to block agents from the workspace — the access policy is gone (ADR-0079)', () => {
    mockQueriesFor(workspaceWith(null))
    renderForm()

    expect(screen.queryByText('Block agent access')).toBeNull()
    expect(screen.getByText('Restrict tools for sessions working in this workspace')).toBeTruthy()
  })

  // ── Saving an empty list is a deliberate, consequential action — confirm it ─────

  it('saving with restriction on and nothing checked requires a second click', async () => {
    mockQueriesFor(workspaceWith([]))
    renderForm()

    fireEvent.click(screen.getByText('Save — blocks every tool'))
    expect(actionMocks['setWorkspaceAllowedTools']).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Confirm — blocks every tool'))
    await waitFor(() => expect(actionMocks['setWorkspaceAllowedTools']).toHaveBeenCalled())
    expect(actionMocks['setWorkspaceAllowedTools']).toHaveBeenCalledWith({ workspaceId: 'ws-1', allowedTools: [] })
  })
})
