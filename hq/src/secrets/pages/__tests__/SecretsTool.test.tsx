// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const data = vi.hoisted(() => ({ secrets: null as unknown, variables: null as unknown }))
const actions = vi.hoisted(() => ({ addPlaceVariable: vi.fn(), turnOffWhatUsesIt: vi.fn(), deletePlaceSecret: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string) => {
    if (op === 'getPlaceSecrets') return { data: data.secrets, isLoading: false }
    if (op === 'getPlaceVariables') return { data: data.variables, isLoading: false }
    return { data: [], isLoading: false }
  },
  useAction: (op: string) => (actions as Record<string, ReturnType<typeof vi.fn>>)[op] ?? vi.fn(),
  getPlaceSecrets: 'getPlaceSecrets', getPlaceVariables: 'getPlaceVariables', getPlaceSecretHistory: 'getPlaceSecretHistory',
  getPlaceVariableHistory: 'getPlaceVariableHistory', addPlaceSecret: 'addPlaceSecret', replacePlaceSecret: 'replacePlaceSecret',
  addPlaceVariable: 'addPlaceVariable', editPlaceVariable: 'editPlaceVariable', deletePlaceSecret: 'deletePlaceSecret',
  deletePlaceVariable: 'deletePlaceVariable', turnOffWhatUsesIt: 'turnOffWhatUsesIt',
}))
vi.mock('../../../storage/pages/filesToolData', () => ({ useWorkspaces: () => ({ workspaces: [{ id: 'w', name: 'site', repoUrl: 'https://github.com/acme/site' }] }) }))
vi.mock('react-router', () => ({ useSearchParams: () => [new URLSearchParams(window.location.search), vi.fn()] }))

import { SecretsTool } from '../SecretsTool'

const place = { type: 'project' as const, id: 'p1' }
const sam = { id: 'u1', name: 'Sam' }
const secret = (over: Record<string, unknown> = {}) => ({
  name: 'STAGING_DEPLOY_KEY', kind: 'file', description: 'ssh key for deploy@staging', issuer: '', renewAt: '', rotateBy: new Date('2026-11-01T00:00:00Z'),
  rotation: 'due_soon', changedAt: new Date('2026-10-03T00:00:00Z'), changedBy: sam, usedBy: [{ id: 'w1', name: 'deploy-staging', enabled: true }], ...over,
})
const variable = { name: 'STAGING_HOST', value: 'staging.example.com', changedAt: new Date('2026-10-14T00:00:00Z'), changedBy: sam, usedBy: [] }

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/')
  data.secrets = { mayChange: true, secrets: [secret(), secret({ name: 'GITHUB_TOKEN', kind: 'from_github', description: 'per run', rotateBy: null, rotation: 'none', changedAt: null, changedBy: null, usedBy: [] })] }
  data.variables = { mayChange: true, variables: [variable] }
})

describe('the Secrets tab', () => {
  it('shows the kind of each value, never a value, with rotation and used by @SC-1335', () => {
    render(<SecretsTool place={place} />)
    const rows = screen.getAllByTestId('secret-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('File')
    expect(rows[0].textContent).toContain('Rotate by 1 Nov')
    expect(rows[0].textContent).toContain('deploy-staging')
    expect(rows[1].textContent).toContain('From GitHub')
    expect(screen.getByRole('tab', { name: 'Secrets · 2' })).toBeTruthy()
  })

  it('offers Replace and the menu to administrators, and no replace for the GitHub token @SC-1335', () => {
    render(<SecretsTool place={place} />)
    expect(screen.getByRole('button', { name: 'Add a secret' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Replace STAGING_DEPLOY_KEY' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Replace GITHUB_TOKEN' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More for STAGING_DEPLOY_KEY' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['History', 'Turn off what uses it', 'Delete'])
  })

  it('gives others only the reading controls @SC-1335', () => {
    data.secrets = { mayChange: false, secrets: [secret()] }
    data.variables = { mayChange: false, variables: [variable] }
    render(<SecretsTool place={place} />)
    expect(screen.queryByRole('button', { name: 'Add a secret' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More for STAGING_DEPLOY_KEY' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['History'])
  })

  it('lists the workflows that are on before turning them off, and shows what to do next @SC-1334', async () => {
    actions.turnOffWhatUsesIt.mockResolvedValue({ workflows: [{ id: 'w1', name: 'deploy-staging', enabled: false }], runsStopped: 1, next: 'Replace it at its issuer and here, then turn the workflows back on.' })
    render(<SecretsTool place={place} />)
    fireEvent.click(screen.getByRole('button', { name: 'More for STAGING_DEPLOY_KEY' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Turn off what uses it' }))
    expect(screen.getByTestId('turn-off-dialog').textContent).toContain('deploy-staging')
    fireEvent.click(screen.getByRole('button', { name: 'Turn off 1 workflow' }))
    await waitFor(() => expect(screen.getByTestId('turn-off-dialog').textContent).toContain('then turn the workflows back on'))
    expect(actions.turnOffWhatUsesIt).toHaveBeenCalledWith({ place, kind: 'secret', name: 'STAGING_DEPLOY_KEY' })
    expect(screen.getByTestId('turn-off-dialog').textContent).toContain('1 run in progress stopped')
  })

  it('offers Turn off what uses it when a delete is refused for use @SC-1334', async () => {
    actions.deletePlaceSecret.mockRejectedValue(Object.assign(new Error('STAGING_DEPLOY_KEY is used by deploy-staging, which is on. Nothing was changed.'), { data: { code: 'in_use' } }))
    render(<SecretsTool place={place} />)
    fireEvent.click(screen.getByRole('button', { name: 'More for STAGING_DEPLOY_KEY' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nothing was changed.'))
    expect(screen.getByRole('button', { name: 'Turn off what uses it' })).toBeTruthy()
  })
})

describe('the Add a secret form @SC-1335', () => {
  it('asks the questions, refuses an empty form, and shows the GitHub box where there is a repository', () => {
    render(<SecretsTool place={place} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a secret' }))
    const form = screen.getByTestId('add-secret-dialog')
    for (const label of ['Name', 'What it is and what it reaches', 'Where to get a new one', 'Rotate by']) expect(form.textContent).toContain(label)
    expect(form.textContent).toContain('Also set it on GitHub')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(form.textContent).toContain('Say what it is and what it reaches.')
    expect(form.textContent).toContain('Type the value or choose a file.')
  })
})

describe('the Variables tab @SC-1335', () => {
  beforeEach(() => window.history.replaceState({}, '', '/?stab=variables'))

  it('shows the value in plain sight and an Edit for administrators', () => {
    render(<SecretsTool place={place} />)
    expect(screen.getByTestId('variable-value').textContent).toBe('staging.example.com')
    expect(screen.getByRole('button', { name: 'Edit STAGING_HOST' })).toBeTruthy()
  })

  it('asks when a value looks like a secret, and can save it once told it is not', async () => {
    actions.addPlaceVariable
      .mockResolvedValueOnce({ saved: false, looksLikeSecret: 'token', question: 'This looks like a secret. Add it under Secrets instead?' })
      .mockResolvedValueOnce({ saved: true, variable: { name: 'NOTE', value: 'ghp_x' } })
    render(<SecretsTool place={place} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a variable' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'NOTE' } })
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'ghp_x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByTestId('attention-text').textContent).toContain('Add it under Secrets instead?'))
    fireEvent.click(screen.getByRole('button', { name: "It isn't a secret: save it" }))
    await waitFor(() => expect(actions.addPlaceVariable).toHaveBeenLastCalledWith({ place, name: 'NOTE', value: 'ghp_x', notASecret: true }))
  })
})
