// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router'

const data = vi.hoisted(() => ({
  setup: { isAdmin: false, setupComplete: true } as { isAdmin: boolean; setupComplete: boolean },
  signals: { notificationsNeedingYou: 3, agentsAtWork: 1, comingUpToday: 2 } as Record<string, number> | undefined,
  agents: [{ id: 'k', name: 'Kernel', handle: 'kernel', avatarUrl: null }, { id: 'pm', name: 'Project manager', handle: 'pm', avatarUrl: null }, { id: 'rs', name: 'Research agent', handle: 'rs', avatarUrl: null }],
  signalArgs: [] as unknown[],
  access: { canTalk: true, fix: null, isAdmin: false, added: { model: true, voice: true } } as { canTalk: boolean; fix: string | null; isAdmin: boolean; added: { model: boolean; voice: boolean } },
  start: vi.fn(),
  dock: null as null | { position: string },
  notifications: [] as unknown[],
  runs: [] as unknown[],
  pins: [] as unknown[],
  cards: { cards: [] as unknown[], unanswered: [] },
}))

vi.mock('wasp/client/operations', () => ({
  getSetupData: 'getSetupData',
  getHomeSignals: 'getHomeSignals',
  getAgents: 'getAgents',
  getMyModelAccess: 'getMyModelAccess',
  getUserSettings: 'getUserSettings',
  getProjects: 'getProjects',
  getPledgeCard: 'getPledgeCard',
  getNotifications: 'getNotifications',
  getMyRuns: 'getMyRuns',
  getPins: 'getPins',
  getProjectCards: 'getProjectCards',
  dismissPledge: 'dismissPledge',
  startConversation: 'startConversation',
  useAction: (fn: unknown) => (fn === 'startConversation' ? data.start : vi.fn()),
  useQuery: (query: string, args: unknown) => {
    if (query === 'getSetupData') return { data: data.setup }
    if (query === 'getHomeSignals') { data.signalArgs.push(args); return { data: data.signals } }
    if (query === 'getAgents') return { data: data.agents }
    if (query === 'getMyModelAccess') return { data: data.access }
    if (query === 'getUserSettings') return { data: { role: 'MEMBER' } }
    if (query === 'getNotifications') return { data: data.notifications }
    if (query === 'getMyRuns') return { data: data.runs }
    if (query === 'getPins') return { data: data.pins }
    if (query === 'getProjectCards') return { data: data.cards }
    return { data: undefined }
  },
}))
// The message box has its own tests; here, only what Home hands it.
vi.mock('../../conversations/components/NewConversationBox', () => ({
  NewConversationBox: (p: { home: string; basePath: string; placeholder: string; autoFocus?: boolean }) => (
    <div data-testid="new-conversation-box" data-home={p.home} data-base={p.basePath} data-autofocus={String(!!p.autoFocus)}>{p.placeholder}</div>
  ),
}))
vi.mock('../../dock/DockContext', () => ({ useDock: () => data.dock }))
vi.mock('@agenthix/ui/primitives', () => ({ PlaceAvatar: () => null }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1', identities: { username: { id: 'Avery' } } } }) }))
vi.mock('../../shared/layouts/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: () => null }))

import { HomePage } from '../pages/HomePage'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function BackFromSetup() {
  const navigate = useNavigate()
  return <><span>the setup</span><button onClick={() => navigate(-1)}>Back</button></>
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
  data.access = { canTalk: true, fix: null, isAdmin: false, added: { model: true, voice: true } }
  data.dock = { position: 'docked' }
  data.notifications = []
  data.runs = []
  data.pins = []
  data.cards = { cards: [], unanswered: [] }
  data.start.mockReset().mockResolvedValue({ conversationId: 'c99', messageId: 'm1' })
})

describe('Home @SC-509', () => {
  it('greets the person and asks what they would like to work on', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Avery$/)
  })

  it('has no box to write in at its top: it shows the state of HQ', () => {
    renderHome()
    expect(screen.getByRole('region', { name: 'Needs you' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Running now' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Pinned projects' })).toBeTruthy()
    expect(screen.queryByTestId('new-conversation-box')).toBeNull()
  })

  it('floats the chat’s box at its foot while the chat is minimised, starting a conversation in Chat', () => {
    data.dock = { position: 'collapsed' }
    renderHome()
    const box = within(screen.getByTestId('floating-composer')).getByTestId('new-conversation-box')
    expect(box.textContent).toBe('Ask any agent…')
    expect(box.dataset).toMatchObject({ home: 'PERSON', base: '/chat', autofocus: 'false' })
  })

  it('shows no box of its own while the chat is beside the page or over it', () => {
    for (const position of ['docked', 'expanded']) {
      data.dock = { position }
      const view = renderHome()
      expect(screen.queryByTestId('floating-composer')).toBeNull()
      view.unmount()
    }
  })

  it('keeps the same page, in the same order, whatever the chat’s state', () => {
    const regions = () => screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    const states = ['collapsed', 'docked', 'expanded'].map((position) => {
      data.dock = { position }
      const view = renderHome()
      const seen = regions()
      view.unmount()
      return seen
    })
    expect(states[1]).toEqual(states[0])
    expect(states[2]).toEqual(states[0])
  })

  it('lists what needs the person, what is running and the projects they pinned, with what is going on in each', () => {
    data.notifications = [
      { id: 'n1', type: 'tool_approval', status: 'unread', title: 'Developer asks to run npm run images', detail: 'Why two pages load slowly', actionUrl: '/tasks/WEB-3', actionLabel: 'Open' },
      { id: 'n2', type: 'task_done', status: 'read', title: 'Writer finished a task', detail: '', actionUrl: null, actionLabel: null },
    ]
    data.runs = [
      { key: 'r1', group: 'running', title: 'Redirects from the old site', href: '/tasks/WEB-4', agent: { name: 'Developer', avatarUrl: null }, place: { name: 'Website relaunch' } },
      { key: 'r2', group: 'finished', title: 'Old run', href: '/tasks/WEB-1', agent: null, place: { name: 'Website relaunch' } },
    ]
    data.pins = [{ id: 'pin1', kind: 'PROJECT', itemId: 'p1', name: 'Website relaunch', href: '/projects/WEB' }, { id: 'pin2', kind: 'AGENT', itemId: 'a1', name: 'Writer', href: '/agents/writer' }]
    data.cards = { cards: [{ projectId: 'p1', isMember: true, needsYouCount: 1, runningCount: 2, lastRunAt: null }], unanswered: [] }
    renderHome()
    const needs = within(screen.getByRole('region', { name: 'Needs you' }))
    expect(needs.getByText('Developer asks to run npm run images')).toBeTruthy()
    expect(needs.queryByText('Writer finished a task')).toBeNull()
    expect(needs.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/tasks/WEB-3')
    const running = within(screen.getByRole('region', { name: 'Running now' }))
    expect(running.getByText('Redirects from the old site')).toBeTruthy()
    expect(running.queryByText('Old run')).toBeNull()
    const pinned = within(screen.getByRole('region', { name: 'Pinned projects' }))
    expect(pinned.getByText('1 needs you · 2 running')).toBeTruthy()
    expect(pinned.queryByText('Writer')).toBeNull()
  })

  it("asks for the signals up to the end of the person's day", () => {
    renderHome()
    const until = new Date((data.signalArgs[0] as { until: string }).until)
    expect([until.getHours(), until.getMinutes()]).toEqual([23, 59])
  })

  it('asks again for the new day when the page stays open past midnight', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      vi.setSystemTime(new Date(2026, 10, 3, 23, 59, 30))
      renderHome()
      const first = new Date((data.signalArgs[0] as { until: string }).until)
      act(() => { vi.advanceTimersByTime(60_000) })
      const last = new Date((data.signalArgs[data.signalArgs.length - 1] as { until: string }).until)
      expect(first.getDate()).toBe(3)
      expect(last.getDate()).toBe(4)
    } finally {
      vi.useRealTimers()
    }
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
    data.access = { canTalk: false, fix: 'org-access', isAdmin: false, added: { model: true, voice: true } }
    renderHome()
    expect(screen.getByTestId('talk-access-line').textContent).toContain('no model is working')
    expect(screen.getByTestId('talk-access-line').textContent).toContain('An organisation admin can set one up')
  })

  it('says no model provider has been added when setup left models for later @SC-722', () => {
    data.access = { canTalk: false, fix: 'org-access', isAdmin: false, added: { model: false, voice: false } }
    renderHome()
    expect(screen.getByTestId('talk-access-line').textContent).toContain('no model provider has been added')
  })

  it('points an organisation admin to Providers @SC-722', () => {
    data.access = { canTalk: false, fix: 'org-access', isAdmin: true, added: { model: true, voice: true } }
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

  it('replaces Home with the setup, so Back from the setup does not return to it', () => {
    data.setup = { isAdmin: true, setupComplete: false }
    const view = render(
      <MemoryRouter initialEntries={['/before', '/']} initialIndex={1}>
        <Routes>
          <Route path="/before" element={<span>before Home</span>} />
          <Route path="/" element={<HomePage />} />
          <Route path="/setup" element={<BackFromSetup />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(view.getByText('the setup')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Back' }))
    expect(view.getByText('before Home')).toBeTruthy()
  })
})
