// @vitest-environment jsdom
/** Settings, one page: a save that works shows nothing, one that fails opens a dialog with Try again; delete needs the key typed. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({
  updateProject: vi.fn(), deleteProject: vi.fn(), getModelList: vi.fn(), getProjectModelsLine: vi.fn(),
  setModelList: vi.fn(), query: vi.fn(), navigate: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  useAction: (a: unknown) => a, useQuery: (q: unknown) => ops.query(q),
  updateProject: ops.updateProject, deleteProject: ops.deleteProject, getModelList: ops.getModelList,
  getProjectModelsLine: ops.getProjectModelsLine, setModelList: ops.setModelList,
}))
vi.mock('react-router', async importOriginal => ({ ...(await importOriginal<typeof import('react-router')>()), useNavigate: () => ops.navigate }))
vi.mock('@agenthix/ui/primitives', async () => {
  const R = await import('react')
  return {
    FIELD: 'field', FOCUS_RING: '',
    Button: (p: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => { const { variant, size, ...rest } = p; void variant; void size; return R.createElement('button', { type: 'button', ...rest }) },
    AttentionDialog: ({ attention, onClose }: { attention: { text: React.ReactNode } | null; onClose: () => void }) => (attention ? R.createElement('div', { role: 'alert', 'data-testid': 'attention-text' }, attention.text, R.createElement('button', { type: 'button', onClick: onClose }, 'Close')) : null),
    NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement>) => R.createElement('select', p),
    Modal: (p: { open: boolean; title?: string; children: React.ReactNode }) => p.open ? R.createElement('div', { role: 'dialog', 'aria-label': p.title }, p.children) : null,
  }
})
vi.mock('../../../../shared/components/ui/NativeSelect', () => ({
  NativeSelect: (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} />,
}))
vi.mock('../../../../models-settings/components/ListEditor', () => ({
  ListEditor: (p: { save: (d: unknown) => Promise<void> }) => <button onClick={() => void p.save({ mode: 'only_these', entries: [] })}>choose Only these</button>,
}))

import { DeleteSection } from '../DeleteSection'
import { AgentsSection } from '../AgentsSection'
import { ModelsSection } from '../ModelsSection'
import type { SettingsProject } from '../types'

afterEach(() => { cleanup(); vi.clearAllMocks() })

const project = (over: Partial<SettingsProject> = {}): SettingsProject => ({
  id: 'p1', name: 'Website relaunch', key: 'WEB', description: null, productId: null, programId: null, accessLevel: 'OPEN',
  personalOwnerId: null, defaultAgentId: null, lead: null, executionSite: { id: 's', label: 'fernhill-hq' },
  product: null, program: null, agents: [], tasks: [], ...over,
})
const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('deleting a project', () => {
  it('stays greyed until the project\'s key is typed', async () => {
    ops.deleteProject.mockResolvedValue(undefined)
    wrap(<DeleteSection project={project()} offer="delete" />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete project…' }))
    const go = screen.getByRole('button', { name: 'Delete project' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Type the project's key/), { target: { value: 'WE' } })
    expect(go.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Type the project's key/), { target: { value: 'WEB' } })
    expect(go.disabled).toBe(false)
    fireEvent.click(go)
    await waitFor(() => expect(ops.deleteProject).toHaveBeenCalledWith({ projectId: 'p1' }))
  })
})

describe('the default agent', () => {
  it('is greyed, saying where to assign one, when the project has no agent', () => {
    wrap(<AgentsSection project={project()} canEdit />)
    expect((screen.getByLabelText('Default agent') as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByRole('link', { name: 'Members › Assign an agent' }).getAttribute('href')).toBe('/projects/WEB?tool=members')
    expect(screen.getByText(/set when the project was made/)).toBeTruthy()
  })
})

describe('a field that fails to save', () => {
  it('shows nothing when it worked, and a dialog with Try again when it did not', async () => {
    const agents = [{ agentId: 'a1', agent: { id: 'a1', name: 'Writer' } }]
    ops.updateProject.mockRejectedValueOnce(new Error('HQ did not answer.')).mockResolvedValue(undefined)
    wrap(<AgentsSection project={project({ agents })} canEdit />)
    fireEvent.change(screen.getByLabelText('Default agent'), { target: { value: 'a1' } })
    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe("Default agent wasn't changed")
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(ops.updateProject).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Saved')).toBeNull()
  })
})

describe('the models section', () => {
  it('opens a dialog when the list is not saved, and Try again sends the same list', async () => {
    ops.query.mockReturnValue({ data: { list: {}, reachable: [], orgName: 'Fernhill' }, refetch: vi.fn() })
    ops.setModelList.mockRejectedValueOnce(new Error('HQ did not answer.')).mockResolvedValue(undefined)
    wrap(<ModelsSection projectId="p1" />)
    fireEvent.click(screen.getByText('choose Only these'))
    expect((await screen.findByRole('dialog')).textContent).toContain('HQ did not answer.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(ops.setModelList).toHaveBeenCalledTimes(2))
    expect(ops.setModelList).toHaveBeenLastCalledWith({ owner: 'project', ownerId: 'p1', mode: 'only_these', entries: [] })
  })
})
