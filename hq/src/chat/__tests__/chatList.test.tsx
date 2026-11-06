// @vitest-environment jsdom
/**
 * The Chat page's list (the board's f5): every conversation newest first, a search and filters kept in the address,
 * several chosen to mark read or archive, rows opening in the chat panel, and a floating box only while the chat is
 * minimised.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { fake, resetFake, row, setInbox } from '../../dock/__tests__/dockFakes'

const h = vi.hoisted(() => ({
  dock: null as null | { position: string; open: { conversationId: string } | null; openConversation: ReturnType<typeof vi.fn>; startNew: ReturnType<typeof vi.fn> },
  archived: [] as string[],
  read: [] as unknown[],
  archivedAsked: [] as boolean[],
  failArchive: new Set<string>(),
}))
vi.mock('../../dock/useConversationInbox', () => ({
  useConversationInbox: (archived = false) => { h.archivedAsked.push(archived); return { inbox: fake.inbox, loaded: true } },
}))
vi.mock('wasp/client/operations', () => ({
  archiveConversation: 'archiveConversation',
  markConversationRead: async (args: unknown) => { h.read.push(args) },
  useAction: () => async (args: { conversationId: string }) => {
    if (h.failArchive.has(args.conversationId)) throw new Error('Only an open conversation can be archived')
    h.archived.push(args.conversationId)
  },
  getAgents: 'getAgents',
  useQuery: () => ({ data: [] }),
}))
vi.mock('@agenthix/ui/primitives', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  PlaceAvatar: ({ name }: { name: string }) => <i>{name[0]}</i>,
  SearchField: ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <input type="search" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
  FilterSelect: ({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
  ),
}))
vi.mock('../../dock/DockContext', () => ({ useDock: () => h.dock }))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <span>{name}</span> }))
vi.mock('../../conversations/components/NewConversationBox', () => ({ NewConversationBox: () => <div data-testid="new-conversation-box" /> }))

import { ChatList } from '../components/ChatList'
import { dayHeading } from '../../shared/conversations/inbox'

const web = { kind: 'project' as const, id: 'p1', key: 'WEB', name: 'Website relaunch' }
const writer = { id: 'w', name: 'Writer', avatarUrl: null } as never
const developer = { id: 'd', name: 'Developer', avatarUrl: null } as never

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}
const renderAt = (at = '/chat') => render(<MemoryRouter initialEntries={[at]}><ChatList /><Where /></MemoryRouter>)
const titles = () => screen.queryAllByTestId('inbox-row').map((r) => within(r).getAllByText(/^(Why|Home|Draft|Plan)/)[0].textContent)
const where = () => screen.getByTestId('where').textContent
const openFilter = () => fireEvent.click(screen.getByRole('button', { name: /^Filter/ }))

beforeEach(() => {
  resetFake()
  h.dock = { position: 'docked', open: { conversationId: 'c3' }, openConversation: vi.fn(), startNew: vi.fn() }
  h.archived = []; h.read = []; h.archivedAsked = []; h.failArchive = new Set()
  setInbox([
    row('c1', { title: 'Why two pages load slowly', place: web, agent: developer, needsYou: 1, lastSeq: 9, lastLine: { by: 'agent', text: 'May I run npm run images?' } }),
    row('c2', { title: 'Home page copy review', place: web, agent: writer, unread: 2, lastSeq: 5 }),
    row('c3', { title: 'Draft the case-study page', place: web, agent: writer, lastSeq: 3 }),
    row('c4', { title: 'Plan my week', agent: writer, lastSeq: 2 }),
  ])
})
afterEach(cleanup)

describe('the list', () => {
  it('holds every conversation, newest first, the one in the panel marked', () => {
    renderAt()
    expect(titles()).toEqual(['Why two pages load slowly', 'Home page copy review', 'Draft the case-study page', 'Plan my week'])
    expect(screen.getAllByTestId('inbox-row').map((r) => r.getAttribute('aria-current'))).toEqual([null, null, 'true', null])
  })

  it('searches the titles and the latest messages', () => {
    renderAt()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search titles and messages' }), { target: { value: 'npm run' } })
    expect(titles()).toEqual(['Why two pages load slowly'])
    expect(where()).toBe('/chat?q=npm+run')
  })

  it('shows Needs you or Unread as tabs, a choice of one, each with its count', () => {
    renderAt()
    fireEvent.click(screen.getByRole('tab', { name: /^Needs you/ }))
    expect(titles()).toEqual(['Why two pages load slowly'])
    expect(where()).toBe('/chat?needs=1')
    fireEvent.click(screen.getByRole('tab', { name: /^Unread/ }))
    expect(where()).toBe('/chat?unread=1')
  })

  it('filters by project and by agent, offering only those with a conversation', () => {
    renderAt()
    openFilter()
    const project = screen.getByLabelText('Filter by project') as HTMLSelectElement
    expect([...project.options].map((o) => o.textContent)).toEqual(['All projects', 'Website relaunch', 'Your space'])
    fireEvent.change(project, { target: { value: 'space' } })
    expect(titles()).toEqual(['Plan my week'])
    fireEvent.change(project, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Filter by agent'), { target: { value: 'w' } })
    expect(titles()).toEqual(['Home page copy review', 'Draft the case-study page', 'Plan my week'])
  })

  it('opens carrying the search and filters from the chat’s bar', () => {
    renderAt('/chat?q=copy&unread=1&c=c3')
    expect(titles()).toEqual(['Home page copy review'])
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('copy')
    expect(screen.getByRole('tab', { name: /^Unread/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('asks for the archived ones with the Archived filter, and offers no selecting among them', () => {
    renderAt()
    expect(h.archivedAsked.at(-1)).toBe(false)
    openFilter()
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }))
    expect(h.archivedAsked.at(-1)).toBe(true)
    expect(where()).toBe('/chat?archived=1')
    expect(screen.queryByRole('button', { name: /Select several to mark read/ })).toBeNull()
  })
})

describe('opening a row', () => {
  it('opens that conversation in the chat panel, whatever state the panel is in', () => {
    h.dock!.position = 'collapsed'
    renderAt()
    fireEvent.click(screen.getAllByTestId('inbox-row')[1])
    expect(h.dock!.openConversation).toHaveBeenCalledWith('c2', '/projects/WEB')
    expect(h.dock!.startNew).not.toHaveBeenCalled()
  })

  it('starts a new conversation in the panel from New conversation', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))
    expect(h.dock!.startNew).toHaveBeenCalledWith({ kind: 'space' })
  })
})

describe('choosing several', () => {
  it('marks them read, through their newest message, and leaves choosing', async () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /Select several to mark read or archive/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Why two pages load slowly' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Home page copy review' }))
    expect(screen.getByText('2 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }))
    await waitFor(() => expect(h.read).toHaveLength(2))
    expect(h.read).toEqual([{ conversationId: 'c1', throughSeq: 9 }, { conversationId: 'c2', throughSeq: 5 }])
    await waitFor(() => expect(screen.queryByText('2 selected')).toBeNull())
  })

  it('archives them, and keeps choosing the ones that could not be, saying so', async () => {
    h.failArchive = new Set(['c2'])
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /Select several to mark read or archive/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Why two pages load slowly' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Home page copy review' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect((await screen.findByRole('alert')).textContent).toContain('1 of 2 could not be changed')
    expect(h.archived).toEqual(['c1'])
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('ticking a row does not open it', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /Select several to mark read or archive/ }))
    fireEvent.click(screen.getAllByTestId('inbox-row')[0])
    expect(h.dock!.openConversation).not.toHaveBeenCalled()
    expect(screen.getByText('1 selected')).toBeTruthy()
  })
})

describe('the floating box', () => {
  it('floats at the foot while the chat is minimised, and is gone beside or over the page', () => {
    for (const [position, shown] of [['collapsed', true], ['docked', false], ['expanded', false]] as const) {
      h.dock!.position = position
      const view = renderAt()
      expect(screen.queryByTestId('floating-composer') !== null).toBe(shown)
      view.unmount()
    }
  })
})
