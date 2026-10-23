// @vitest-environment jsdom
/** The screens that read and save an agent's permissions: Permissions here, Your permissions in Chat, and the organisation's section. */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { here, organisation } from './permissionsFixtures'

const ops = vi.hoisted(() => ({
  reads: {} as Record<string, unknown>,
  calls: [] as { name: string; args: unknown }[],
  role: 'ADMIN',
}))
vi.mock('wasp/client/operations', () => {
  const act = (name: string) => (args: unknown) => { ops.calls.push({ name, args }); return Promise.resolve({}) }
  return {
    getAgentPermissionsHere: 'getAgentPermissionsHere', getAgentOverride: 'getAgentOverride', getAgentPermissions: 'getAgentPermissions',
    setAgentOverride: 'setAgentOverride', updateAgentSettings: 'updateAgentSettings',
    getUserSettings: () => Promise.resolve({ role: ops.role }),
    useQuery: (name: string) => ({ data: ops.reads[name], isLoading: false, error: undefined }),
    useAction: (name: string) => act(name),
  }
})
vi.mock('../manage/ManageSection', async () => {
  const { useState } = await import('react')
  return {
    ManageSection: ({ title, summary, editor }: { title: string; summary: React.ReactNode; editor: (close: () => void) => React.ReactNode }) => {
      const [open, setOpen] = useState(false)
      return <section aria-label={title}><button onClick={() => setOpen(true)}>Edit {title}</button>{open ? editor(() => setOpen(false)) : summary}</section>
    },
  }
})

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/agents')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, () => {
  const icon = () => null
  return { Search: icon, ChevronDown: icon, Loader2: icon, Plus: icon, Bot: icon, Check: icon }
})

import { AgentPermissionsHere } from '../AgentPermissionsHere'
import { PermissionsSection } from '../manage/PermissionsSection'

afterEach(() => { cleanup(); ops.calls = []; ops.reads = {}; ops.role = 'ADMIN' })

describe('Permissions here @SC-620', () => {
  const mount = (canChange = true) => {
    ops.reads = {
      getAgentPermissionsHere: { ...here(), canChange },
      getAgentOverride: { model: 'haiku', approval: null, allowedTools: null, allowedBashPatterns: null },
    }
    render(<AgentPermissionsHere agentId="a1" agentName="Frontend dev" boundaryType="project" boundaryId="p1" title="Permissions here" />)
  }

  it('saves the project’s row with the model it already holds', async () => {
    mount()
    fireEvent.click(within(screen.getByRole('group', { name: 'Fetch a page' })).getByText('Never'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(ops.calls).toHaveLength(1))
    expect(ops.calls[0]).toEqual({
      name: 'setAgentOverride',
      args: { agentId: 'a1', boundaryType: 'project', boundaryId: 'p1', model: 'haiku', approval: null, allowedTools: [{ name: 'web_fetch', state: 'never' }], allowedBashPatterns: null },
    })
  })

  it('is read only to a member who is not an admin of the project', () => {
    mount(false)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('works the same for a person’s own narrowing in Chat', async () => {
    ops.reads = { getAgentPermissionsHere: { ...here(), canChange: true }, getAgentOverride: null }
    render(<AgentPermissionsHere agentId="a1" agentName="Frontend dev" boundaryType="user" boundaryId="u1" title="Your permissions in Chat" />)
    expect(screen.getByText('Your permissions in Chat')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('group', { name: 'Approval' })).getByText('Immediate').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(ops.calls[0]).toMatchObject({ name: 'setAgentOverride', args: { boundaryType: 'user', boundaryId: 'u1', model: null, approval: 'immediate' } }))
  })
})

describe('Permissions on the organisation’s agent page @SC-620', () => {
  const agent = { id: 'a1', name: 'Frontend dev', approval: 'deferred', allowedTools: null, allowedBashPatterns: null }

  it('shows a summary, opens the full view under Edit, and saves only what changed', async () => {
    ops.reads = { getAgentPermissions: organisation() }
    render(<MemoryRouter><PermissionsSection agent={agent as never} /></MemoryRouter>)
    expect(screen.getByText('Any other command ask · 2 patterns')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Permissions' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Approval' })).getByText('Immediate').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(ops.calls).toHaveLength(1))
    expect(ops.calls[0].name).toBe('updateAgentSettings')
    expect(ops.calls[0].args).toMatchObject({ agentId: 'a1', approval: 'immediate' })
  })

  it('refuses a save from someone who is not an organisation admin', async () => {
    ops.role = 'MEMBER'
    ops.reads = { getAgentPermissions: organisation() }
    render(<MemoryRouter><PermissionsSection agent={agent as never} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Permissions' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Approval' })).getByText('Immediate').closest('button')!)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')
    expect(ops.calls).toHaveLength(0)
  })
})
