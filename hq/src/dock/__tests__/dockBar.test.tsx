// @vitest-environment jsdom
/**
 * The chat's bar as its menu and queue (the board's f1, states 4 to 9): Conversations with one badge for everything
 * waiting opens one list over the app, newest first, with All, Unread and Needs you as tabs that stay as left;
 * the pinned places carry what is going on in each and open their own conversations. A tap outside closes either,
 * nothing changed; choosing a conversation opens it in the panel, which marks it read once in sight.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useNavigate } from 'react-router'

type View = { id: string; home: string; projectId: string | null; taskId: string | null; title: string | null; status: string; activeTurnId?: string | null; agent: { id: string; name: string; avatarUrl: null } }
type Activity = { working: boolean; needYou: number }
const h = vi.hoisted(() => ({
  threadMounts: 0,
  boxMounts: 0,
  views: {} as Record<string, View>,
  activity: {} as Record<string, Activity>,
  intervals: [] as unknown[],
  listed: [] as { args: Record<string, unknown> }[],
}))
vi.mock('../useConversationInbox', async () => (await import('./dockFakes')).inboxModule)
vi.mock('../useMarkShownRead', async () => (await import('./dockFakes')).markModule)
vi.mock('../pinnedPlaces', async (orig) => (await import('./dockFakes')).pinnedModule(await orig()))
vi.mock('../../shared/components/AppSidebar', () => ({ AppSidebar: () => <nav data-testid="sidebar" /> }))
vi.mock('../../shared/layouts/MobileHeader', () => ({ MobileHeader: () => null }))
vi.mock('../../shared/layouts/ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../../shared/layouts/ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../../shared/layouts/VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../../shared/hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../useDockWidth', () => ({ useDockWidth: () => 'wide' }))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span> }))
vi.mock('../../conversations/components/ConversationThread', () => ({
  // Stands in for the thread: its instance and unsent text, and what it reports of the work under way in it.
  ConversationThread: ({ conversationId, onActivity }: { conversationId: string; onActivity?: (a: Activity) => void }) => {
    const [instance] = React.useState(() => ++h.threadMounts)
    const [replying, setReplying] = React.useState(false)
    const reported = h.activity[conversationId] ?? { working: false, needYou: 0 }
    const working = reported.working || replying
    React.useEffect(() => { onActivity?.({ working, needYou: reported.needYou }) }, [onActivity, working, reported.needYou])
    return (
      <div data-testid="thread" data-id={conversationId} data-instance={instance}>
        <textarea aria-label="Message" defaultValue="" />
        <button onClick={() => setReplying(true)}>a reply starts</button>
      </div>
    )
  },
}))
vi.mock('../../conversations/components/NewConversationBox', () => ({
  // Stands in for the box: the place it was given, and what it does once a conversation is started.
  NewConversationBox: ({ home, projectId, basePath }: { home: string; projectId?: string; basePath: string }) => {
    const [instance] = React.useState(() => ++h.boxMounts)
    const navigate = useNavigate()
    return (
      <div data-testid="new-box" data-home={home} data-project={projectId ?? ''} data-base={basePath} data-instance={instance}>
        <button onClick={() => navigate(`${basePath}/t/c9`)}>send it</button>
      </div>
    )
  },
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: undefined }) }))
vi.mock('wasp/client/operations', () => {
  const getConversation = async () => null
  const getProject = async () => null
  const getTask = async () => null
  const getProjectByKey = async () => null
  const getProjects = async () => []
  const getConversations = async () => []
  const getConversationActivity = async () => ({ operations: [] })
  const getPins = async () => []
  const getConversationAgentChoices = async () => []
  const projects: Record<string, { id: string; key: string; name: string; personalOwnerId: string | null }> = {
    AGX: { id: 'p1', key: 'AGX', name: 'Agenthix', personalOwnerId: null },
    WEB: { id: 'p2', key: 'WEB', name: 'Website', personalOwnerId: null },
  }
  return {
    getConversation, getProject, getTask, getProjectByKey, getProjects, getConversations, getConversationActivity,
    getPins, getConversationAgentChoices,
    getLastWrittenConversation: async () => null,
    useQuery: (fn: unknown, args: Record<string, string> | undefined, opts?: { enabled?: boolean; refetchInterval?: unknown }) => {
      if (opts?.enabled === false) return { data: undefined }
      if (fn === getConversation) { h.intervals.push(opts?.refetchInterval); return { data: h.views[args!.conversationId] } }
      if (fn === getProject && args?.projectId === 'p1') return { data: { key: 'AGX', name: 'Agenthix', personalOwnerId: null } }
      if (fn === getProjectByKey) return { data: projects[args!.key] }
      if (fn === getProjects) return { data: [...Object.values(projects).map((p) => ({ ...p, isMember: true })), { id: 'p3', key: 'OPEN', name: 'Not mine', personalOwnerId: null, isMember: false }] }
      if (fn === getConversations) {
        h.listed.push({ args: args! })
        const projectId = (args as { projectId?: string }).projectId
        return { data: projectId === 'p1'
          ? [{ id: 'c2', title: 'Release checklist', lastMessageAt: '2026-10-18T10:00:00Z' }, { id: 'c5', title: 'Image signing', lastMessageAt: '2026-10-18T11:00:00Z' }]
          : [{ id: 'c1', title: 'Plan my week', lastMessageAt: '2026-10-17T10:00:00Z' }] }
      }
      return { data: undefined }
    },
  }
})

import { renderDataRouter } from './dockHarness'
import { fake, resetFake, row, setInbox } from './dockFakes'

const go = (name: string) => fireEvent.click(screen.getByRole('link', { name }))
const dock = () => screen.getByTestId('dock')
const press = (name: string | RegExp) => fireEvent.click(within(dock()).getByRole('button', { name }))
const box = () => screen.getByTestId('new-box')
const state = (name: string) => fireEvent.click(within(screen.getByTestId('dock-state')).getByRole('radio', { name }))
const checked = () => within(screen.getByTestId('dock-state')).getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.getAttribute('aria-label'))
const selectedPlace = () => screen.getByRole('option', { selected: true }).textContent
const view = (id: string, home: string, more: Partial<View> = {}): View =>
  ({ id, home, projectId: null, taskId: null, title: `Talk ${id}`, status: 'ACTIVE', agent: { id: 'k', name: 'Kernel', avatarUrl: null }, ...more })

beforeEach(() => {
  resetFake()
  h.threadMounts = 0
  h.boxMounts = 0
  h.activity = {}
  h.intervals = []
  h.listed = []
  h.views = { c1: view('c1', 'PERSON'), c2: view('c2', 'PROJECT', { projectId: 'p1' }), c5: view('c5', 'PROJECT', { projectId: 'p1' }), c9: view('c9', 'PROJECT', { projectId: 'p1' }) }
})
afterEach(cleanup)

const web = { kind: 'project' as const, id: 'p2', key: 'WEB', name: 'Website' }
const agx = { kind: 'project' as const, id: 'p1', key: 'AGX', name: 'Agenthix' }
const kernel = { id: 'k', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const listed = () => within(screen.getByRole('dialog', { name: 'Conversations' })).getAllByTestId('inbox-row').map((r) => r.dataset.id)
const filter = (name: RegExp) => fireEvent.click(screen.getByRole('tab', { name }))

beforeEach(() => {
  localStorage.clear()
  setInbox([
    row('c5', { place: agx, needsYou: 1, agent: kernel, title: 'Image signing', lastLine: { by: 'agent', text: 'May I run the build?' } }),
    row('c2', { place: agx, unread: 2, agent: kernel, title: 'Release checklist' }),
    row('c1', { title: 'Plan my week', lastLine: { by: 'you', text: 'Shorter, please.' } }),
    row('c7', { place: web, working: true, title: 'Redirects' }),
  ])
  fake.pinned = [
    { id: 'p1', placeId: 'p1', ref: { kind: 'project', key: 'AGX' }, name: 'Agenthix', href: '/projects/AGX', basePath: '/projects/AGX' },
    { id: 'p2', placeId: 'p2', ref: { kind: 'project', key: 'WEB' }, name: 'Website', href: '/projects/WEB', basePath: '/projects/WEB' },
  ]
})

describe('Conversations', () => {
  it('carries one badge for everything waiting, amber while anything needs the person', () => {
    renderDataRouter('/tasks?c=c1')
    const button = within(dock()).getByRole('button', { name: /^Conversations/ })
    expect(button.getAttribute('aria-label')).toBe('Conversations, 2 waiting')
    expect(within(button).getByTestId('dock-waiting').textContent).toBe('2')
    expect(within(button).getByTestId('dock-waiting').className).toContain('bg-warning')
  })

  it('opens one list over the whole app, newest first, each row with its state, its last line and its place', () => {
    renderDataRouter('/tasks?c=c1')
    press(/^Conversations/)
    expect(listed()).toEqual(['c5', 'c2', 'c1', 'c7'])
    const rows = screen.getAllByTestId('inbox-row')
    expect(rows[0].getAttribute('aria-label')).toBe('Image signing, needs your okay, Agenthix')
    expect(rows[0].textContent).toContain('Kernel: May I run the build?')
    expect(rows[1].getAttribute('aria-label')).toBe('Release checklist, 2 new replies, Agenthix')
    expect(rows[2].textContent).toContain('You: Shorter, please.')
    expect(rows[2].getAttribute('aria-current')).toBe('true')
    expect(rows[3].querySelector('[data-working]')).not.toBeNull()
    expect(screen.getByRole('link', { name: /Open in Chat/ }).getAttribute('href')).toBe('/chat')
  })

  it('shows Needs you, Unread or all as tabs, and keeps the choice for the next time', () => {
    renderDataRouter('/tasks?c=c1')
    press(/^Conversations/)
    filter(/^Needs you/)
    expect(listed()).toEqual(['c5'])
    filter(/^Unread/)
    expect(listed()).toEqual(['c2'])
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    press(/^Conversations/)
    expect(screen.getByRole('tab', { name: /^Unread/ }).getAttribute('aria-selected')).toBe('true')
    expect(listed()).toEqual(['c2'])
    expect(within(dock()).getByRole('button', { name: /^Conversations/ }).getAttribute('aria-label')).toBe('Conversations, 2 waiting')
  })

  it('carries its search and filters to the Chat page, in Open in Chat and in All in Chat', () => {
    renderDataRouter('/tasks?c=c1')
    press(/^Conversations/)
    filter(/^Needs you/)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search conversations' }), { target: { value: 'photos' } })
    const carried = '/chat?q=photos&needs=1'
    expect(screen.getByRole('link', { name: /Open in Chat/ }).getAttribute('href')).toBe(carried)
    expect(screen.getByRole('link', { name: /All in Chat/ }).getAttribute('href')).toBe(carried)
  })

  it('searches, and a tap outside or Esc closes it with nothing changed', async () => {
    const { here } = renderDataRouter('/tasks?c=c1')
    press(/^Conversations/)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search conversations' }), { target: { value: 'website' } })
    expect(listed()).toEqual(['c7'])
    fireEvent.click(screen.getByTestId('dock-scrim'))
    expect(screen.queryByRole('dialog')).toBeNull()
    press(/^Conversations/)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(here()).toBe('/tasks?c=c1')
    expect(screen.getByTestId('thread').getAttribute('data-id')).toBe('c1')
  })

  it('choosing one opens it in the panel, the page staying, and marks it read once in sight', async () => {
    const { here } = renderDataRouter('/tasks?c=c1')
    state('Minimised (⌘J)')
    press(/^Conversations/)
    fireEvent.click(screen.getAllByTestId('inbox-row')[1])
    await waitFor(() => expect(here()).toBe('/tasks?c=c2'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(dock().dataset.position).toBe('docked')
    expect(screen.getByTestId('thread').getAttribute('data-id')).toBe('c2')
    expect(screen.getByText('Tasks page')).toBeTruthy()
    expect(fake.inSight.at(-1)).toBe('c2')
  })
})

describe('pinned places in the bar', () => {
  it('lists your space first, then the pinned projects, each with what is going on in it; working shows as a dot, never an outline', () => {
    renderDataRouter('/tasks?c=c2')
    const tiles = screen.getAllByTestId('dock-place-tile')
    expect(tiles.map((t) => t.dataset.place)).toEqual(['space', 'p1', 'p2'])
    expect(tiles[1].getAttribute('aria-label')).toBe('Agenthix · 1 needs you · 1 unread · 2 conversations')
    expect(tiles[1].textContent).toContain('!')
    expect(tiles[2].getAttribute('aria-label')).toBe('Website · working · 1 conversation')
    expect(tiles[2].dataset.working).toBe('true')
    expect(within(tiles[2]).getByTestId('working-dot')).toBeTruthy()
    expect(within(tiles[1]).queryByTestId('working-dot')).toBeNull()
    // The open conversation's place is no longer marked on its tile, and nothing is outlined.
    for (const t of tiles) {
      expect(t.getAttribute('aria-current')).toBeNull()
      expect(t.outerHTML).not.toMatch(/outline/)
    }
  })

  it('gives the selected fill and aria-expanded to the button whose pop-up is open, and to no other', () => {
    renderDataRouter('/tasks?c=c2')
    const tiles = screen.getAllByTestId('dock-place-tile')
    const list = screen.getByRole('button', { name: /^Conversations/ })
    expect(list.getAttribute('aria-expanded')).toBe('false')
    for (const t of [...tiles, list]) expect(t.className).not.toContain('bg-selected')
    fireEvent.click(tiles[1])
    expect(tiles[1].getAttribute('aria-expanded')).toBe('true')
    expect(tiles[1].className).toContain('bg-selected')
    expect(tiles[2].className).not.toContain('bg-selected')
    expect(list.className).not.toContain('bg-selected')
    fireEvent.click(screen.getByTestId('dock-scrim'))
    fireEvent.click(list)
    expect(list.getAttribute('aria-expanded')).toBe('true')
    expect(list.className).toContain('bg-selected')
    expect(screen.getAllByTestId('dock-place-tile')[1].className).not.toContain('bg-selected')
  })

  it('closes a pop-up when its own button is pressed again, like a toggle', () => {
    renderDataRouter('/tasks?c=c2')
    const tile = () => screen.getAllByTestId('dock-place-tile')[1]
    fireEvent.click(tile())
    expect(tile().getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(tile())
    expect(tile().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('dock-scrim')).toBeNull()
    const list = screen.getByRole('button', { name: /^Conversations/ })
    fireEvent.click(list)
    fireEvent.click(list)
    expect(list.getAttribute('aria-expanded')).toBe('false')
    const plus = screen.getByRole('button', { name: /New conversation/ })
    fireEvent.click(plus)
    expect(plus.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(plus)
    expect(plus.getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves the bar above the dimming while a pop-up is open, so another button switches straight to its pop-up', () => {
    renderDataRouter('/tasks?c=c2')
    const tiles = screen.getAllByTestId('dock-place-tile')
    fireEvent.click(tiles[1])
    const scrim = screen.getByTestId('dock-scrim')
    expect(scrim.className).toContain('right-14')
    expect(scrim.closest('[data-dock-layer]')?.className).toContain('pointer-events-none')
    const list = screen.getByRole('button', { name: /^Conversations/ })
    fireEvent.click(list)
    expect(list.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Conversations' })).toBeTruthy()
    expect(screen.getAllByTestId('dock-place-tile')[1].getAttribute('aria-expanded')).toBe('false')
  })

  it('is a 56 px bar of 36 px buttons with the groups divided and no Pinned label', () => {
    renderDataRouter('/tasks?c=c2')
    const bar = screen.getByTestId('dock-bar')
    expect(bar.className).toContain('w-14')
    expect(bar.className).toContain('gap-4')
    expect(within(bar).queryByText('Pinned')).toBeNull()
    for (const b of within(bar).getAllByRole('button')) expect(b.className).toMatch(/\bh-9 w-9\b/)
    expect(bar.querySelectorAll(':scope > span[aria-hidden]')).toHaveLength(2)
  })

  it('opens a place’s conversations, most recent first, with Open project and New conversation here', async () => {
    const { here } = renderDataRouter('/tasks?c=c1')
    fireEvent.click(screen.getAllByTestId('dock-place-tile')[1])
    const layer = screen.getByRole('dialog', { name: 'Agenthix' })
    expect(within(layer).getAllByTestId('inbox-row').map((r) => r.dataset.id)).toEqual(['c5', 'c2'])
    expect(within(layer).getAllByTestId('inbox-row')[0].textContent).toContain('Kernel · needs your okay')
    expect(within(layer).getByRole('link', { name: /Open project/ }).getAttribute('href')).toBe('/projects/AGX')
    fireEvent.click(within(layer).getByRole('button', { name: /New conversation here/ }))
    expect(screen.getByRole('dialog', { name: 'New conversation' })).toBeTruthy()
    expect(box().dataset).toMatchObject({ home: 'PROJECT', project: 'p1' })
    fireEvent.click(screen.getByTestId('dock-scrim'))
    fireEvent.click(screen.getAllByTestId('dock-place-tile')[1])
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Agenthix' })).getAllByTestId('inbox-row')[0])
    await waitFor(() => expect(here()).toBe('/tasks?c=c5'))
    expect(screen.getByTestId('thread').getAttribute('data-id')).toBe('c5')
  })
})
