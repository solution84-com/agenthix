// @vitest-environment jsdom
/** Organisation › Agents (every screen reviewed spec §3): Needs attention’s Review opens it filtered to the agents with approval Bypassed. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const agent = (id: string, name: string, approval: string) => ({
  agent: { id, name, handle: id, role: 'Role', avatarUrl: null, coverUrl: null, defaultModel: 'sonnet', runtime: 'claude-sdk', approval, isKernel: false },
  now: { state: 'idle', lead: null, needsYouCount: 0, runningCount: 0, next: null }, projectCount: 1, inMyProjects: true, lastWorkedAt: null,
})
const CARDS = [agent('rb', 'Release bot', 'bypassed'), agent('fd', 'Frontend dev', 'deferred'), agent('da', 'Data analyst', 'bypassed')]
vi.mock('wasp/client/operations', () => ({
  useQuery: (query: string) => ({ data: query === 'getOrgAgents' ? { agents: CARDS, canManage: true, unanswered: [] } : undefined, isLoading: false }),
  useAction: () => vi.fn(),
  getOrgAgents: 'getOrgAgents', getAgentUsage: 'getAgentUsage', createAgent: 'createAgent',
}))
vi.mock('../../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('../ManageGate', () => ({ ManageGate: ({ children }: { children: React.ReactNode }) => <>{children}</>, useOrgAdminState: () => 'admin' }))
vi.mock('../useImportAgents', () => ({ useImportAgents: () => ({ importing: false, onFiles: vi.fn() }) }))
vi.mock('../../AgentCover', () => ({ AgentCover: () => null }))
vi.mock('../../../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))
vi.mock('@agenthix/ui/agents', () => ({ CreateAgentModal: () => null, BypassedMark: () => <span>Bypassed mark</span> }))

import { AgentsManageListPage } from '../AgentsManageListPage'

const show = (path: string) => render(<MemoryRouter initialEntries={[path]}><AgentsManageListPage /></MemoryRouter>)
const names = () => screen.getAllByTestId('manage-agent-row').map(r => r.querySelector('.font-semibold')?.textContent?.replace(/Role$/, '').trim())
afterEach(cleanup)

describe('Organisation › Agents', () => {
  it('lists every agent', () => {
    show('/org/agents')
    expect(names()).toEqual(['Release bot', 'Frontend dev', 'Data analyst'])
  })

  it('shows only the agents with approval Bypassed for ?approval=bypassed, and lets everyone be shown again', () => {
    show('/org/agents?approval=bypassed')
    expect(names()).toEqual(['Release bot', 'Data analyst'])
    expect(screen.getByText('Showing the agents with approval Bypassed.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show all agents' }))
    expect(names()).toHaveLength(3)
  })
})
