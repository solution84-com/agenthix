// @vitest-environment jsdom
/** *Also set it on GitHub* on the add-secret form (secrets spec part 3): it proposes, then the approval follows at once. */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const data = vi.hoisted(() => ({} as Record<string, unknown>))
const actions = vi.hoisted(() => ({ addPlaceSecret: vi.fn(), approveWorkflowVersion: vi.fn(), startWorkflowRun: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string) => ({ data: data[op], refetch: vi.fn() }),
  useAction: (op: string) => (actions as Record<string, ReturnType<typeof vi.fn>>)[op],
  addPlaceSecret: 'addPlaceSecret', approveWorkflowVersion: 'approveWorkflowVersion', startWorkflowRun: 'startWorkflowRun',
  getPlaceWorkflows: 'getPlaceWorkflows', getWorkflow: 'getWorkflow',
}))

import { AddSecretDialog } from '../../components/AddSecretDialog'

const place = { type: 'project' as const, id: 'p1' }
const repository = { workspaceId: 'w1', repoUrl: 'https://github.com/acme-dev/docs-site' }

function fill() {
  render(<MemoryRouter><AddSecretDialog open onClose={vi.fn()} place={place} repository={repository} /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'STAGING_DEPLOY_KEY' } })
  fireEvent.change(screen.getByLabelText('What it is and what it reaches'), { target: { value: 'ssh key for staging' } })
  fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'canary-not-a-real-secret' } })
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  data.getPlaceWorkflows = { mayAdminister: true, workflows: [{ id: 'wf', name: 'set-github-secrets', waiting: [{ number: 3, hash: 'h3' }] }] }
  actions.addPlaceSecret.mockResolvedValue({ name: 'STAGING_DEPLOY_KEY', github: { workflow: 'set-github-secrets', proposed: true, version: 3 } })
})

describe('Also set it on GitHub', () => {
  it('is ticked off by default, and says where the secret will go', () => {
    fill()
    const box = screen.getByRole('checkbox', { name: /Also set it on GitHub/ }) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(screen.getByText('acme-dev/docs-site').tagName).toBe('B')
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('saves with the flag, then sends the person to the full review when the card may not approve', async () => {
    data.getWorkflow = { versions: [{ number: 3, cardMayApprove: false, reviewLevel: 'MEDIUM', checkSummary: 'A secret is given to a step.' }] }
    fill()
    fireEvent.click(screen.getByRole('checkbox', { name: /Also set it on GitHub/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save, then approve' }))
    await waitFor(() => expect(screen.getByTestId('approve-github-secret')).toBeTruthy())
    expect(actions.addPlaceSecret).toHaveBeenCalledWith(expect.objectContaining({ name: 'STAGING_DEPLOY_KEY', alsoOnGitHub: true }))
    expect(screen.getByRole('heading', { name: 'Approve: set-github-secrets, version 3' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Review all of it' }).getAttribute('href')).toBe('/workflows/wf/versions/3')
    expect(screen.queryByRole('button', { name: 'Approve and set it' })).toBeNull()
  })

  it('approves and runs it when the checks allow, for the production environment', async () => {
    data.getWorkflow = { versions: [{ number: 3, cardMayApprove: true, reviewLevel: 'LOW', checkSummary: null }] }
    actions.approveWorkflowVersion.mockResolvedValue({ number: 3, enabled: true })
    actions.startWorkflowRun.mockResolvedValue({ runId: 'r1' })
    fill()
    fireEvent.click(screen.getByRole('checkbox', { name: /Also set it on GitHub/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save, then approve' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Approve and set it' }))
    await waitFor(() => expect(actions.startWorkflowRun).toHaveBeenCalledWith({ workflowId: 'wf', workspaceId: 'w1', parameters: { environment: 'production' } }))
    expect(actions.approveWorkflowVersion).toHaveBeenCalledWith({ workflowId: 'wf', hash: 'h3', via: 'card' })
    expect(screen.getByRole('link', { name: 'Follow the run' }).getAttribute('href')).toBe('/workflows/wf/runs/r1')
  })

  it('says why when HQ could not propose it, and the secret is still added', async () => {
    actions.addPlaceSecret.mockResolvedValue({ name: 'STAGING_DEPLOY_KEY', github: { workflow: 'set-github-secrets', proposed: false, message: 'The same version is already approved.' } })
    fill()
    fireEvent.click(screen.getByRole('checkbox', { name: /Also set it on GitHub/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save, then approve' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('already approved'))
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy()
  })
})
