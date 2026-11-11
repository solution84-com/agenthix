// @vitest-environment jsdom
/** A failed read of an agent is not "not in this project": only a final answer says that. */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const q = vi.hoisted(() => ({ agent: {} as Record<string, unknown> }))
vi.mock('wasp/client/operations', () => ({
  getProjectAgent: 'getProjectAgent', getProjectAgents: 'getProjectAgents', getProjectTeams: 'getProjectTeams',
  getPlaceInstructions: 'getPlaceInstructions', getAgents: 'getAgents', createTask: 'createTask',
  removeAgentFromProject: 'removeAgentFromProject', addAgentToProject: 'addAgentToProject',
  useQuery: (op: string) => (op === 'getProjectAgent' ? q.agent : { data: undefined }),
  useAction: () => vi.fn(),
}))
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@agenthix/ui/agents', () => ({
  ProjectAgentView: () => <div>the agent's page</div>, ProjectAgentRemove: () => <div>remove the agent</div>, ProjectAgentAssign: () => null,
}))
vi.mock('../../../shared/hooks/useMayWork', () => ({ useMayWork: () => true }))
vi.mock('../../../agents/profile/AgentProfileCard', () => ({ AgentProfileTrigger: () => null }))
vi.mock('../../../agents/pages/AgentPermissionsHere', () => ({ AgentPermissionsHere: () => null }))
vi.mock('../avatarOf', () => ({ avatarOf: () => null }))
vi.mock('../useAgentsToolUrl', () => ({ filesAddress: () => ({}), useOpenTool: () => vi.fn() }))
vi.mock('../../../conversations/threadPaths', () => ({ newConversationPath: () => '/' }))

import { AgentScreen, RemoveScreen } from '../AgentScreens'

const props = { projectId: 'p1', agentId: 'a1', onBack: vi.fn() }
const detail = { agent: { name: 'A', handle: 'a' }, project: { key: 'WEB' }, canManage: true, tasks: { total: 0, done: 0 }, isDefault: false }
const failed = (error: unknown, data?: unknown) => { q.agent = { data, isLoading: false, error, dataUpdatedAt: Date.now(), refetch: vi.fn() } }
beforeEach(() => cleanup())

describe('an agent that could not be read @SC-1935', () => {
  it('says it could not be read, with Try again, when the first read failed', () => {
    failed(new Error('down'))
    render(<AgentScreen {...props} onRemove={vi.fn()} />)
    expect(screen.getByText('The agent could not be read')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('That agent is not in this project.')).toBeNull()
  })

  it('says the agent is not in this project only for a final answer', () => {
    failed(Object.assign(new Error('x'), { statusCode: 404 }))
    render(<AgentScreen {...props} onRemove={vi.fn()} />)
    expect(screen.getByText('That agent is not in this project.')).toBeTruthy()
  })

  it('keeps the page when a refetch fails with the agent held', () => {
    failed(new Error('down'), detail)
    render(<AgentScreen {...props} onRemove={vi.fn()} />)
    expect(screen.getByText("the agent's page")).toBeTruthy()
    expect(screen.queryByText('That agent is not in this project.')).toBeNull()
  })

  it('the remove screen says it could not be read too, not "not in this project"', () => {
    failed(new Error('down'))
    render(<RemoveScreen projectId="p1" agentId="a1" onCancel={vi.fn()} onRemoved={vi.fn()} />)
    expect(screen.getByText('The agent could not be read')).toBeTruthy()
    expect(screen.queryByText('That agent is not in this project.')).toBeNull()
  })
})
