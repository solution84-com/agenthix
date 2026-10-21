// @vitest-environment jsdom
/** Chat's Agents tool: the organisation's agents, and for one, your permissions in Chat. */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'

const idle = { state: 'idle', lead: null, needsYouCount: 0, runningCount: 0, next: null }
const reads = vi.hoisted(() => ({} as Record<string, unknown>))
vi.mock('wasp/client/operations', () => ({
  getOrgAgents: 'getOrgAgents',
  useQuery: (name: string) => ({ data: reads[name], isLoading: false, error: undefined }),
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('../../agents/pages/AgentPermissionsHere', () => ({
  AgentPermissionsHere: (p: { boundaryType: string; boundaryId: string; title: string }) => <p>{p.title} for {p.boundaryType} {p.boundaryId}</p>,
}))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => <i /> }))
vi.mock('@agenthix/ui/primitives', () => ({ ViewHeaderRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, PanelHeaderContent: ({ title }: { title: string }) => <b>{title}</b> }))
vi.mock('@agenthix/ui/agents', () => ({ nowLine: () => ({ label: 'Idle', tone: 'muted', detail: '' }) }))

import { ChatAgentsTool } from '../ChatAgentsTool'

afterEach(() => { cleanup(); for (const k of Object.keys(reads)) delete reads[k] })

const agent = { id: 'a1', name: 'Frontend dev', handle: 'frontend-dev', role: 'Builds the site', avatarUrl: null }
function Where() { return <p data-testid="where">{useLocation().search}</p> }

describe('Chat’s Agents tool @SC-587', () => {
  it('lists the organisation’s agents, each opening in the panel', () => {
    reads.getOrgAgents = { agents: [{ agent, now: idle }] }
    render(<MemoryRouter initialEntries={['/chat?tool=agents']}><ChatAgentsTool /><Where /></MemoryRouter>)
    fireEvent.click(screen.getByText('Frontend dev'))
    expect(screen.getByTestId('where').textContent).toBe('?tool=agents&agent=a1')
  })

  it('shows your permissions in Chat, scrolled to when asked for', () => {
    reads.getOrgAgents = { agents: [{ agent, now: idle }] }
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.textContent ?? '') }
    try {
      render(<MemoryRouter initialEntries={['/chat?tool=agents&agent=a1&focus=permissions']}><ChatAgentsTool /></MemoryRouter>)
    } finally {
      Element.prototype.scrollIntoView = original
    }
    expect(screen.getByText('Your permissions in Chat for user u1')).toBeTruthy()
    expect(scrolled).toHaveLength(1)
    expect(scrolled[0]).toContain('Your permissions in Chat')
  })
})
