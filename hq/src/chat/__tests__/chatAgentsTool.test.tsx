// @vitest-environment jsdom
/** A personal place's Agents tool: its roster with Add and Remove, and for one agent, your permissions in Chat. */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

const idle = { state: 'idle', lead: null, needsYouCount: 0, runningCount: 0, next: null }
const reads = vi.hoisted(() => ({} as Record<string, unknown>))
vi.mock('wasp/client/operations', () => ({
  getOrgAgents: 'getOrgAgents',
  getProjectAgents: 'getProjectAgents',
  useQuery: (name: string) => ({ data: reads[name], isLoading: false, error: reads.error, dataUpdatedAt: 0, refetch: () => undefined }),
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('../../agents/pages/AgentPermissionsHere', () => ({
  AgentPermissionsHere: (p: { boundaryType: string; boundaryId: string; title: string }) => <p>{p.title} for {p.boundaryType} {p.boundaryId}</p>,
}))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <i /> }))
vi.mock('@agenthix/ui/primitives', async (importOriginal) => ({ ...(await importOriginal<typeof import('@agenthix/ui/primitives')>()), ViewHeaderRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, PanelHeaderContent: ({ title }: { title: string }) => <b>{title}</b> }))
vi.mock('../../projects/agents/AgentScreens', () => ({
  AssignScreen: () => <p>assign screen</p>,
  RemoveScreen: (p: { agentId: string }) => <p>remove screen {p.agentId}</p>,
}))
vi.mock('@agenthix/ui/agents', () => ({ nowLine: () => ({ label: 'Idle', tone: 'muted', detail: '' }) }))

import { ChatAgentsTool } from '../ChatAgentsTool'

afterEach(() => { cleanup(); for (const k of Object.keys(reads)) delete reads[k] })

const agent = { id: 'a1', name: 'Frontend dev', handle: 'frontend-dev', role: 'Builds the site', avatarUrl: null }
function Where() { return <p data-testid="where">{useLocation().search}</p> }

describe('Chat’s Agents tool @SC-587 @SC-1929', () => {
  it('puts the not-up-to-date line after the roster, so no row moves', () => {
    reads.getProjectAgents = { canManage: true, agents: [{ agent, now: idle }] }
    reads.error = new Error('Network Error')
    render(<MemoryRouter initialEntries={['/chat?tool=agents']}><ChatAgentsTool projectId="p1" /></MemoryRouter>)
    const row = screen.getByText('Frontend dev').closest('li')!
    expect(row.compareDocumentPosition(screen.getByText(/Not up to date/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('lists the place’s roster, each opening in the panel', () => {
    reads.getProjectAgents = { canManage: true, agents: [{ agent, now: idle }] }
    render(<MemoryRouter initialEntries={['/chat?tool=agents']}><ChatAgentsTool projectId="p1" /><Where /></MemoryRouter>)
    fireEvent.click(screen.getByText('Frontend dev'))
    expect(screen.getByTestId('where').textContent).toBe('?tool=agents&agent=a1')
  })

  it('offers Add and Remove to its owner, and opens them in the panel', () => {
    reads.getProjectAgents = { canManage: true, agents: [{ agent, now: idle }] }
    const { unmount } = render(<MemoryRouter initialEntries={['/chat?tool=agents']}><ChatAgentsTool projectId="p1" /><Where /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Frontend dev' }))
    expect(screen.getByTestId('where').textContent).toBe('?tool=agents&agent=a1&aview=remove')
    unmount()
    render(<MemoryRouter initialEntries={['/chat?tool=agents']}><ChatAgentsTool projectId="p1" /><Where /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByTestId('where').textContent).toBe('?tool=agents&aview=assign')
  })

  it('shows the Add screen and the Remove screen for their addresses', () => {
    render(<MemoryRouter initialEntries={['/chat?tool=agents&aview=assign']}><ChatAgentsTool projectId="p1" /></MemoryRouter>)
    expect(screen.getByText('assign screen')).toBeTruthy()
    cleanup()
    render(<MemoryRouter initialEntries={['/chat?tool=agents&agent=a1&aview=remove']}><ChatAgentsTool projectId="p1" /></MemoryRouter>)
    expect(screen.getByText('remove screen a1')).toBeTruthy()
  })

  it('says so when the roster is empty, and offers no change to anyone but its owner', () => {
    reads.getProjectAgents = { canManage: false, agents: [] }
    render(<MemoryRouter initialEntries={['/chat?tool=agents']}><ChatAgentsTool projectId="p1" /></MemoryRouter>)
    expect(screen.getByText(/No agent is on this list yet/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
  })

  it('shows your permissions in Chat, scrolled to when asked for', () => {
    reads.getOrgAgents = { agents: [{ agent, now: idle }] }
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.textContent ?? '') }
    try {
      render(<MemoryRouter initialEntries={['/chat?tool=agents&agent=a1&focus=permissions']}><ChatAgentsTool projectId="p1" /></MemoryRouter>)
    } finally {
      Element.prototype.scrollIntoView = original
    }
    expect(screen.getByText('Your permissions in Chat for user u1')).toBeTruthy()
    expect(scrolled).toHaveLength(1)
    expect(scrolled[0]).toContain('Your permissions in Chat')
  })
})
