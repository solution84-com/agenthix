// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'

const data = vi.hoisted(() => ({
  setup: { isAdmin: false, setupComplete: true } as { isAdmin: boolean; setupComplete: boolean },
  signals: { notificationsNeedingYou: 3, agentsAtWork: 1, comingUpToday: 2 } as Record<string, number> | undefined,
  agents: [{ id: 'k', name: 'Kernel', handle: 'kernel', avatarUrl: null }, { id: 'pm', name: 'Project manager', handle: 'pm', avatarUrl: null }, { id: 'rs', name: 'Research agent', handle: 'rs', avatarUrl: null }],
  signalArgs: [] as unknown[],
  access: { canTalk: true, fix: null, isAdmin: false } as { canTalk: boolean; fix: string | null; isAdmin: boolean },
  start: vi.fn(),
}))

vi.mock('wasp/client/operations', () => ({
  getSetupData: 'getSetupData',
  getHomeSignals: 'getHomeSignals',
  getAgents: 'getAgents',
  getMyModelAccess: 'getMyModelAccess',
  getUserSettings: 'getUserSettings',
  getProjects: 'getProjects',
  getPledgeCard: 'getPledgeCard',
  dismissPledge: 'dismissPledge',
  startConversation: 'startConversation',
  useAction: (fn: unknown) => (fn === 'startConversation' ? data.start : vi.fn()),
  useQuery: (query: string, args: unknown) => {
    if (query === 'getSetupData') return { data: data.setup }
    if (query === 'getHomeSignals') { data.signalArgs.push(args); return { data: data.signals } }
    if (query === 'getAgents') return { data: data.agents }
    if (query === 'getMyModelAccess') return { data: data.access }
    if (query === 'getUserSettings') return { data: { role: 'MEMBER' } }
    return { data: undefined }
  },
}))
// The message box has its own tests; here, only what Home hands it.
vi.mock('../../conversations/components/NewConversationBox', () => ({
  NewConversationBox: (p: { home: string; basePath: string; placeholder: string; autoFocus?: boolean }) => (
    <div data-testid="new-conversation-box" data-home={p.home} data-base={p.basePath} data-autofocus={String(!!p.autoFocus)}>{p.placeholder}</div>
  ),
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1', identities: { username: { id: 'Avery' } } } }) }))
vi.mock('../../shared/layouts/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../shared/hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))

import { HomePage } from '../pages/HomePage'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<><HomePage /><Where /></>} />
        <Route path="/setup" element={<span>the setup</span>} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

const where = () => screen.getByTestId('where').textContent

beforeEach(() => {
  data.setup = { isAdmin: false, setupComplete: true }
  data.signals = { notificationsNeedingYou: 3, agentsAtWork: 1, comingUpToday: 2 }
  data.signalArgs = []
  data.access = { canTalk: true, fix: null, isAdmin: false }
  data.start.mockReset().mockResolvedValue({ conversationId: 'c99', messageId: 'm1' })
})

describe('Home @SC-509', () => {
  it('greets the person and asks what they would like to work on', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Avery$/)
    expect(screen.getByText('What would you like to work on?')).toBeTruthy()
  })

  it('focuses the message box, which starts a conversation in Chat', () => {
    renderHome()
    const box = screen.getByTestId('new-conversation-box')
    expect(box.textContent).toBe('Ask any agent…')
    expect(box.dataset).toMatchObject({ home: 'PERSON', base: '/chat', autofocus: 'true' })
  })

  it("asks for the signals up to the end of the person's day", () => {
    renderHome()
    const until = new Date((data.signalArgs[0] as { until: string }).until)
    expect([until.getHours(), until.getMinutes()]).toEqual([23, 59])
  })

  it('opens Notifications, Runs, and the Automation in Chat from its signals', () => {
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: /3 notifications need you/ }))
    expect(where()).toBe('/?panel=notifications')
    fireEvent.click(screen.getByRole('button', { name: /1 running/ }))
    expect(where()).toBe('/?panel=runs')
    fireEvent.click(screen.getByRole('button', { name: /2 coming up today/ }))
    expect(where()).toBe('/chat?tool=automation')
  })

  it('has no Jump back in', () => {
    renderHome()
    expect(screen.queryByText('Jump back in')).toBeNull()
  })

  it('offers first suggestions, each starting a new conversation with the built-in agent in Chat @SC-722', async () => {
    renderHome()
    expect(screen.getAllByRole('button', { name: /What can you do\?|Set up my first project|Invite my team/ })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Set up my first project' }))
    await waitFor(() => expect(where()).toBe('/chat/t/c99'))
    expect(data.start).toHaveBeenCalledWith({ home: 'PERSON', agentId: 'k', text: 'Set up my first project', clientMessageId: expect.any(String) })
  })

  it('says why a suggestion could not start a conversation, and stays', async () => {
    data.start.mockRejectedValue(new Error('There is no agent to talk to yet'))
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'What can you do?' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no agent to talk to'))
    expect(where()).toBe('/')
  })

  it('says under the message box that agents cannot answer yet, and who can fix it @SC-722', () => {
    data.access = { canTalk: false, fix: 'org-access', isAdmin: false }
    renderHome()
    expect(screen.getByTestId('talk-access-line').textContent).toContain('An organisation admin can set one up')
  })

  it('points an organisation admin to Providers @SC-722', () => {
    data.access = { canTalk: false, fix: 'org-access', isAdmin: true }
    renderHome()
    expect(screen.getByRole('link', { name: 'Manage organisation › Providers' }).getAttribute('href')).toBe('/admin/providers')
  })

  it('says nothing about model access when the person can talk @SC-722', () => {
    renderHome()
    expect(screen.queryByTestId('talk-access-line')).toBeNull()
  })

  it('sends an admin whose organisation is not set up to the setup @SC-722', () => {
    data.setup = { isAdmin: true, setupComplete: false }
    renderHome()
    expect(screen.getByText('the setup')).toBeTruthy()
  })
})
