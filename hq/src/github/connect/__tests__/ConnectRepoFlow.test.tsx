// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ checkConnect: vi.fn(), connectRepo: vi.fn(), getWorkflow: vi.fn(), approveWorkflowVersion: vi.fn() }))
const data = vi.hoisted(() => ({} as Record<string, unknown>))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string) => ({ data: data[op], isLoading: false, refetch: vi.fn() }),
  useAction: (op: string) => (ops as Record<string, ReturnType<typeof vi.fn>>)[op],
  checkConnect: (...a: unknown[]) => ops.checkConnect(...a),
  getWorkflow: (...a: unknown[]) => ops.getWorkflow(...a),
  connectRepo: 'connectRepo', approveWorkflowVersion: 'approveWorkflowVersion', getProjectGitHubAccounts: 'getProjectGitHubAccounts', getMyGitHubAccounts: 'getMyGitHubAccounts',
  getPlaceWorkflows: 'getPlaceWorkflows',
}))

import { ConnectRepoFlow } from '../ConnectRepoFlow'

const target = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' }
const accounts = {
  defaultId: 'acme-tests-id', mayChangeDefault: true,
  accounts: [
    { id: 'acme-tests-id', login: 'acme-tests', reach: { canCreateRepository: true } },
    { id: 'archive-id', login: 'acme-archive', reach: { canCreateRepository: false } },
  ],
}
const ok = { ok: true, account: { id: 'acme-tests-id', login: 'acme-tests' }, problem: null, useExisting: null }

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useFakeTimers()
  data.getProjectGitHubAccounts = accounts
  data.getPlaceWorkflows = { mayAdminister: true, workflows: [] }
})
afterEach(() => vi.useRealTimers())

const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(500) }) }
const renderFlow = () => render(<MemoryRouter><ConnectRepoFlow target={target} defaultName="docs-site" /></MemoryRouter>)

describe('the connect flow', () => {
  it("offers a person's own space the accounts chosen for them, and picks one when there is a choice @SC-1314", async () => {
    const own = { ownerType: 'user' as const, ownerId: 'u1', workspaceId: 'w2' }
    data.getMyGitHubAccounts = { defaultId: null, accounts: accounts.accounts }
    ops.checkConnect.mockResolvedValue(ok)
    render(<MemoryRouter><ConnectRepoFlow target={own} defaultName="docs-site" /></MemoryRouter>)
    const picker = screen.getByLabelText('GitHub account') as HTMLSelectElement
    expect(picker.value).toBe('')
    fireEvent.change(picker, { target: { value: 'acme-tests-id' } })
    await settle()
    expect(ops.checkConnect).toHaveBeenCalledWith({ target: own, kind: 'new', installationId: 'acme-tests-id', name: 'docs-site' })
  })


  it('starts at the project\'s default account and checks the name as it is typed @SC-1314 @SC-1315', async () => {
    ops.checkConnect.mockResolvedValue(ok)
    renderFlow()
    expect((screen.getByLabelText('GitHub account') as HTMLSelectElement).value).toBe('acme-tests-id')
    await settle()
    expect(ops.checkConnect).toHaveBeenCalledWith({ target, kind: 'new', installationId: 'acme-tests-id', name: 'docs-site' })
    expect(screen.getByTestId('connect-check').textContent).toContain('✓ Free on acme-tests')
    expect((screen.getByRole('button', { name: 'Create and connect' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('says how to fix a selected-repositories account, and does not allow creating @SC-1315', async () => {
    ops.checkConnect.mockResolvedValue({ ok: false, account: { id: 'archive-id', login: 'acme-archive' }, useExisting: null,
      problem: { kind: 'selected_repositories', words: 'acme-archive gives the App only the repositories selected on GitHub. Nothing was changed.' } })
    renderFlow()
    fireEvent.change(screen.getByLabelText('GitHub account'), { target: { value: 'archive-id' } })
    await settle()
    expect(screen.getByTestId('connect-check').textContent).toContain('only the repositories selected on GitHub')
    expect((screen.getByRole('button', { name: 'Create and connect' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Connect an existing repository instead' })).toBeTruthy()
  })

  it('offers the existing repository when the name is taken @SC-1315', async () => {
    ops.checkConnect.mockResolvedValue({ ok: false, account: { id: 'acme-tests-id', login: 'acme-tests' }, problem: { kind: 'name_taken', words: 'acme-tests/docs-site already exists on GitHub. Nothing was changed.' }, useExisting: { repoUrl: 'https://github.com/acme-tests/docs-site' } })
    renderFlow()
    await settle()
    ops.checkConnect.mockResolvedValue(ok)
    fireEvent.click(screen.getByRole('button', { name: 'Use the existing one' }))
    expect((screen.getByPlaceholderText('https://github.com/org/repo') as HTMLInputElement).value).toBe('https://github.com/acme-tests/docs-site')
  })

  it('connects, then shows the starter workflows waiting @SC-1318', async () => {
    ops.checkConnect.mockResolvedValue(ok)
    ops.connectRepo.mockResolvedValue({ repoUrl: 'https://github.com/acme-tests/docs-site', starters: { problem: null, proposed: [
      { workflow: 'push', proposed: true, version: 1 }, { workflow: 'pull', proposed: true, version: 1 }, { workflow: 'open-pull-request', proposed: true, version: 1 },
    ] } })
    data.getPlaceWorkflows = { mayAdminister: true, workflows: ['push', 'pull', 'open-pull-request'].map((name) => ({ id: name, name, approved: null, waiting: [{ number: 1, hash: `h-${name}` }] })) }
    ops.getWorkflow.mockImplementation(async ({ workflowId }: { workflowId: string }) => ({ versions: [{ number: 1, cardMayApprove: workflowId !== 'pull', reviewLevel: 'LOW', checkSummary: null }] }))
    ops.approveWorkflowVersion.mockResolvedValue({ number: 1, enabled: true })
    renderFlow()
    await settle()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create and connect' })) })
    expect(ops.connectRepo).toHaveBeenCalledWith({ target, mode: 'init', name: 'docs-site', installationId: 'acme-tests-id' })
    expect(screen.getByTestId('starters-panel').textContent).toContain('Connected to acme-tests/docs-site')
    expect(screen.getAllByTestId('starter-row')).toHaveLength(3)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Approve all three' })) })
    expect(ops.approveWorkflowVersion).toHaveBeenCalledTimes(2)
    expect(ops.approveWorkflowVersion).not.toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'pull' }))
    expect(ops.approveWorkflowVersion).toHaveBeenCalledWith({ workflowId: 'push', hash: 'h-push', via: 'card' })
    expect(screen.getByTestId('starters-panel').textContent).toContain('Needs its full review')
  })

  it('shows a refusal in words and keeps the form @SC-1315', async () => {
    ops.checkConnect.mockResolvedValue(ok)
    ops.connectRepo.mockRejectedValue(new Error('GitHub refused. Nothing was changed.'))
    renderFlow()
    await settle()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create and connect' })) })
    expect(screen.getByRole('alert').textContent).toContain('Nothing was changed.')
    expect(screen.getByTestId('connect-flow')).toBeTruthy()
  })
})
