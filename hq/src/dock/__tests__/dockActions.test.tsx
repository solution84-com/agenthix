// @vitest-environment jsdom
/**
 * The chat's bar (the board's f1): ＋ and *Talk about* start a new conversation over the open one, in the place the
 * canvas is on (the draft itself is `dockDraft.test.tsx`); the state control at the top minimises the panel to its
 * bar, puts it beside the page or over it, ⌘J toggling — never a remount. The Conversations list and the pinned
 * places are `dockBar.test.tsx`.
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
import { resetFake } from './dockFakes'

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

describe('a new conversation from the bar', () => {
  it('＋ starts one in the project the canvas is on, over the open one, and sending makes it the conversation in the panel @SC-1035', async () => {
    const { here } = renderDataRouter('/projects/AGX?c=c1')
    press('New conversation')
    const layer = screen.getByRole('dialog', { name: 'New conversation' })
    expect(within(layer).getByTestId('new-box').dataset).toMatchObject({ home: 'PROJECT', project: 'p1', base: '/projects/AGX' })
    expect(screen.getByTestId('thread').closest('.hidden')).toBeNull()
    expect(selectedPlace()).toContain('Agenthix')
    await waitFor(() => expect(here()).toBe('/projects/AGX'))

    fireEvent.click(screen.getByText('send it'))
    await waitFor(() => expect(here()).toBe('/projects/AGX?c=c9'))
    expect(screen.getByTestId('thread').getAttribute('data-id')).toBe('c9')
    expect(screen.getByText('Project page')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'New conversation' })).toBeNull()
  })

  it('a tap outside it, or Esc, puts back the conversation that was open, as it was', async () => {
    const { here } = renderDataRouter('/projects/AGX?c=c1')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'half a thought' } })
    press('New conversation')
    fireEvent.click(screen.getByTestId('dock-scrim'))
    await waitFor(() => expect(here()).toBe('/projects/AGX?c=c1'))
    expect(screen.queryByRole('dialog')).toBeNull()
    press('New conversation')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(here()).toBe('/projects/AGX?c=c1'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(h.threadMounts).toBe(1)
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('half a thought')
  })

  it('takes a task’s project as the place, and your space anywhere outside a project @SC-1035 @SC-1031', () => {
    renderDataRouter('/tasks/AGX-41?c=c1')
    press('New conversation')
    expect(box().dataset).toMatchObject({ home: 'PROJECT', project: 'p1' })
    cleanup()
    renderDataRouter('/tasks?c=c1')
    press('New conversation')
    expect(box().dataset).toMatchObject({ home: 'PERSON', project: '', base: '/chat' })
    expect(selectedPlace()).toContain('Your space')
  })

  it('*Talk about <place>* in the bar starts one about that place, the canvas staying @SC-1024 @SC-1035', async () => {
    const { here } = renderDataRouter('/projects/AGX?c=c1')
    fireEvent.click(screen.getByRole('button', { name: 'Talk about Agenthix' }))
    expect(box().dataset).toMatchObject({ home: 'PROJECT', project: 'p1' })
    await waitFor(() => expect(here()).toBe('/projects/AGX'))
    expect(screen.getByText('Project page')).toBeTruthy()
  })

  it('from the panel minimised, opens it with the new conversation over the one that was open; closing folds it away again', async () => {
    renderDataRouter('/tasks?c=c1')
    state('Minimised (⌘J)')
    press('New conversation')
    expect(dock().dataset.position).toBe('docked')
    expect(screen.getByRole('dialog', { name: 'New conversation' })).toBeTruthy()
    fireEvent.click(screen.getByTestId('dock-scrim'))
    await waitFor(() => expect(dock().dataset.position).toBe('collapsed'))
  })

  it('the panel’s header shows only where the conversation lives; its buttons are the bar’s @SC-1028', () => {
    renderDataRouter('/tasks?c=c1')
    const header = screen.getByTestId('dock-header')
    expect(header.textContent).not.toContain('Talk c1')
    expect(within(header).getByTestId('dock-place-chip').textContent).toBe('Your space')
    expect(within(header).queryAllByRole('button')).toEqual([])
    const bar = screen.getByRole('navigation', { name: 'Chat' })
    expect(within(bar).getAllByRole('radio').map((b) => b.getAttribute('aria-label'))).toEqual(['Minimised (⌘J)', 'Beside the page', 'Over the page'])
    expect(within(bar).getAllByRole('button').map((b) => b.getAttribute('aria-label')).slice(0, 2)).toEqual(['New conversation', 'Conversations'])
  })
})

describe('the panel’s three states', () => {
  it('shows the current one filled, and one click goes to any of them, never remounting the thread', () => {
    renderDataRouter('/projects?c=c1')
    expect(checked()).toEqual(['Beside the page'])
    state('Over the page')
    expect(dock().dataset.position).toBe('expanded')
    expect(checked()).toEqual(['Over the page'])
    state('Minimised (⌘J)')
    expect(dock().dataset.position).toBe('collapsed')
    state('Beside the page')
    expect(dock().dataset.position).toBe('docked')
    expect(h.threadMounts).toBe(1)
  })

  it('minimised leaves only the bar: no strip, the thread kept mounted with its unsent text', () => {
    renderDataRouter('/tasks?c=c1')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'half a thought' } })
    state('Minimised (⌘J)')
    expect(screen.queryByTestId('dock-rail')).toBeNull()
    expect(screen.getByTestId('thread').closest('.hidden')).not.toBeNull()
    expect(screen.getByRole('navigation', { name: 'Chat' })).toBeTruthy()
    expect(dock().className).toContain('w-14')
    state('Beside the page')
    expect(h.threadMounts).toBe(1)
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('half a thought')
  })

  it('over the page hides the canvas, keeps the navigation, and drops back beside it on any navigation @SC-1032', async () => {
    const { here } = renderDataRouter('/projects?c=c1')
    state('Over the page')
    expect(screen.getByTestId('shell-screen').className.split(' ')).toContain('hidden')
    expect(screen.getByTestId('sidebar')).toBeTruthy()
    go('to tasks')
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    expect(dock().dataset.position).toBe('docked')
    expect(screen.getByTestId('shell-screen').className.split(' ')).not.toContain('hidden')
    expect(h.threadMounts).toBe(1)
  })

  it('⌘J minimises and reopens it, from beside or over the page, never remounting the thread @SC-1033', () => {
    renderDataRouter('/tasks?c=c1')
    const key = () => act(() => { fireEvent.keyDown(window, { key: 'j', metaKey: true }) })
    key()
    expect(dock().dataset.position).toBe('collapsed')
    key()
    expect(dock().dataset.position).toBe('docked')
    state('Over the page')
    key()
    expect(dock().dataset.position).toBe('collapsed')
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    expect(dock().dataset.position).toBe('docked')
    expect(h.threadMounts).toBe(1)
    expect(screen.getByTestId('thread').getAttribute('data-instance')).toBe('1')
  })

  it('stays minimised when the canvas moves, and opening a conversation from a list opens the panel', async () => {
    const { here } = renderDataRouter('/projects?c=c2')
    state('Minimised (⌘J)')
    go('to tasks')
    await waitFor(() => expect(here()).toBe('/tasks?c=c2'))
    expect(dock().dataset.position).toBe('collapsed')
    go('open c1')
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    expect(dock().dataset.position).toBe('docked')
  })
})
