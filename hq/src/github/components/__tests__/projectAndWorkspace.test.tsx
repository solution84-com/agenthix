// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const data = vi.hoisted(() => ({} as Record<string, unknown>))
const actions = vi.hoisted(() => ({ setProjectGitHubDefault: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string) => ({ data: data[op], error: null, isLoading: false, refetch: vi.fn() }),
  useAction: (op: string) => (actions as Record<string, ReturnType<typeof vi.fn>>)[op] ?? vi.fn(),
  getProjectGitHubAccounts: 'getProjectGitHubAccounts', getPlaceWorkflows: 'getPlaceWorkflows', setProjectGitHubDefault: 'setProjectGitHubDefault',
  getRepoState: 'getRepoState', getWorkflows: 'getWorkflows', getRuns: 'getRuns', getRepoSecrets: 'getRepoSecrets',
}))
vi.mock('../../../storage/pages/filesToolData', () => ({
  useWorkspaces: () => ({ workspaces: data.workspaces }),
}))

import { ProjectGitHubSection } from '../ProjectGitHubSection'
import { OperationsPanel } from '../../../storage/pages/OperationsPanel'

const web = (id: string, name: string, definition: unknown) => ({ id, name, enabled: true, approved: { number: 1, hash: 'h', definition }, waiting: [], lastRun: null })

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  data.getProjectGitHubAccounts = {
    mayChangeDefault: true, defaultId: 'n',
    accounts: [{ id: 'n', login: 'north-ltd', type: 'Organization', reach: {} }, { id: 'a', login: 'acme', type: 'Organization', reach: {} }],
  }
  data.getPlaceWorkflows = { mayAdminister: true, mayRun: true, workflows: [web('1', 'push', { github: { contents: 'write' } }), web('2', 'lint', { github: {} })] }
  data.workspaces = [
    { id: 'w1', name: 'website', repoUrl: 'https://github.com/north-ltd/website' },
    { id: 'w2', name: 'deploy-scripts', repoUrl: 'https://github.com/acme/deploy-scripts' },
    { id: 'w3', name: 'notes', repoUrl: null },
  ]
})

describe('a project\'s GitHub section', () => {
  it('shows the default account, each workspace\'s repository and whether its account is the default', () => {
    render(<MemoryRouter><ProjectGitHubSection projectId="p1" basePath="/projects/N" /></MemoryRouter>)
    expect((screen.getByLabelText('Default GitHub account') as HTMLSelectElement).value).toBe('n')
    const rows = screen.getByTestId('workspace-repos').querySelectorAll('tbody tr')
    expect(rows[0].textContent).toContain('north-ltd/website')
    expect(rows[0].textContent).toContain('default')
    expect(rows[1].textContent).toContain('changed')
    expect(rows[2].textContent).toContain('Not connected')
    expect(screen.getByText(/^push/).textContent).not.toContain('lint')
    expect(screen.getByRole('link', { name: 'Open Workflows' }).getAttribute('href')).toBe('/projects/N?tool=workflows')
  })

  it('changes the default account', async () => {
    actions.setProjectGitHubDefault.mockResolvedValue({ ok: true })
    render(<MemoryRouter><ProjectGitHubSection projectId="p1" basePath="/projects/N" /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Default GitHub account'), { target: { value: 'a' } })
    await waitFor(() => expect(actions.setProjectGitHubDefault).toHaveBeenCalledWith({ projectId: 'p1', installationId: 'a' }))
  })

  it('leaves the default to the administrators', () => {
    data.getProjectGitHubAccounts = { ...(data.getProjectGitHubAccounts as object), mayChangeDefault: false }
    render(<MemoryRouter><ProjectGitHubSection projectId="p1" basePath="/projects/N" /></MemoryRouter>)
    expect((screen.getByLabelText('Default GitHub account') as HTMLSelectElement).disabled).toBe(true)
  })
})

describe('a connected workspace\'s GitHub section', () => {
  it('lists workflows that reach GitHub, GitHub\'s own with their last run and no Run button, and secrets by name', () => {
    data.getRepoState = { repoUrl: 'https://github.com/north-ltd/website', isGitRepo: true, hasFiles: true }
    data.getWorkflows = [{ id: 7, name: 'Deploy', path: '.github/workflows/deploy.yml', state: 'active' }]
    data.getRuns = [{ id: 1, name: 'Deploy', status: 'completed', conclusion: 'success', runNumber: 41, headSha: 'abc', createdAt: new Date().toISOString(), htmlUrl: 'https://github.com/x/runs/1' }]
    data.getRepoSecrets = [
      { name: 'DEPLOY_TOKEN', environment: 'production', fromHq: true, updatedAt: '2026-10-02', note: null },
      { name: 'LEGACY_KEY', environment: null, fromHq: false, updatedAt: '2026-09-01', note: null },
    ]
    render(<MemoryRouter><OperationsPanel target={{ ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }} /></MemoryRouter>)
    const section = screen.getByTestId('workspace-github')
    expect(section.textContent).toContain('push')
    expect(section.textContent).not.toContain('lint')
    expect(section.textContent).toContain('deploy.yml')
    expect(section.textContent).toContain('Last run #41')
    expect(screen.queryByRole('button', { name: /Run/ })).toBeNull()
    expect(section.textContent).toContain('DEPLOY_TOKEN')
    expect(section.textContent).toContain('From Secrets')
    expect(section.textContent).toContain('Outside HQ')
    expect(section.querySelector('input')).toBeNull()
  })
})
