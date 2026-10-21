// @vitest-environment jsdom
/**
 * The dock's buttons (spec §2, §4, §10, §11): ＋ and *Talk about* start a new conversation in the dock, in the place
 * the canvas is on (the draft itself is `dockDraft.test.tsx`); 🕘 lists the place's recent conversations; ⤢ expands over
 * the canvas until the person goes somewhere; › collapses to a rail, ⌘J toggling — never a remount.
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
vi.mock('../../shared/components/AppSidebar', () => ({ AppSidebar: () => <nav data-testid="sidebar" /> }))
vi.mock('../../pins/components/PinnedFoot', () => ({ PinnedFoot: () => null }))
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

const go = (name: string) => fireEvent.click(screen.getByRole('link', { name }))
const dock = () => screen.getByTestId('dock')
const press = (name: string | RegExp) => fireEvent.click(within(dock()).getByRole('button', { name }))
const box = () => screen.getByTestId('new-box')
const selectedPlace = () => screen.getByRole('option', { selected: true }).textContent
const view = (id: string, home: string, more: Partial<View> = {}): View =>
  ({ id, home, projectId: null, taskId: null, title: `Talk ${id}`, status: 'ACTIVE', agent: { id: 'k', name: 'Kernel', avatarUrl: null }, ...more })

beforeEach(() => {
  h.threadMounts = 0
  h.boxMounts = 0
  h.activity = {}
  h.intervals = []
  h.listed = []
  h.views = { c1: view('c1', 'PERSON'), c2: view('c2', 'PROJECT', { projectId: 'p1' }), c5: view('c5', 'PROJECT', { projectId: 'p1' }), c9: view('c9', 'PROJECT', { projectId: 'p1' }) }
})
afterEach(cleanup)

describe('a new conversation in the dock', () => {
  it('＋ starts one in the project the canvas is on, in place of the open one, and sending opens it there @SC-1035', async () => {
    const { here } = renderDataRouter('/projects/AGX?c=c1')
    press('New conversation')
    expect(screen.getByTestId('thread').closest('.hidden')).not.toBeNull()
    expect(box().dataset).toMatchObject({ home: 'PROJECT', project: 'p1', base: '/projects/AGX' })
    expect(selectedPlace()).toContain('Agenthix')
    await waitFor(() => expect(here()).toBe('/projects/AGX'))

    fireEvent.click(screen.getByText('send it'))
    await waitFor(() => expect(here()).toBe('/projects/AGX?c=c9'))
    expect(screen.getByTestId('thread').getAttribute('data-id')).toBe('c9')
    expect(screen.getByText('Project page')).toBeTruthy()
    expect(screen.queryByTestId('new-box')).toBeNull()
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

  it('*Talk about <place>* in the bar starts one about that place in the dock, the canvas staying @SC-1024 @SC-1035', async () => {
    const { here } = renderDataRouter('/projects/AGX?c=c1')
    fireEvent.click(screen.getByRole('button', { name: 'Talk about Agenthix' }))
    expect(box().dataset).toMatchObject({ home: 'PROJECT', project: 'p1' })
    await waitFor(() => expect(here()).toBe('/projects/AGX'))
    expect(screen.getByText('Project page')).toBeTruthy()
  })

  it('the dock’s header shows the place chip and the buttons, with no title of its own @SC-1028', () => {
    renderDataRouter('/tasks?c=c1')
    const header = screen.getByTestId('dock-header')
    expect(header.textContent).not.toContain('Talk c1')
    expect(within(header).getByTestId('dock-place-chip').textContent).toBe('Your space')
    expect(within(header).getAllByRole('button').map((b) => b.getAttribute('aria-label')))
      .toEqual(['Recent conversations', 'New conversation', 'Expand over the page', 'Collapse (⌘J)'])
  })
})

describe('🕘 recent conversations @SC-1031', () => {
  it('lists the canvas place’s conversations, newest first, each with its place, and opens one in the dock', async () => {
    const { here } = renderDataRouter('/projects/AGX?c=c1')
    press('Recent conversations')
    const rows = screen.getAllByTestId('dock-recent-row')
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Image signing'), expect.stringContaining('Release checklist')])
    expect(rows[0].textContent).toContain('Agenthix')
    expect(h.listed.at(-1)?.args).toEqual({ home: 'PROJECT', projectId: 'p1' })
    fireEvent.click(rows[1])
    await waitFor(() => expect(here()).toBe('/projects/AGX?c=c2'))
    expect(screen.getByTestId('thread').getAttribute('data-id')).toBe('c2')
    expect(screen.getByText('Project page')).toBeTruthy()
  })

  it('in your space lists its conversations, and *All conversations* opens the Chat page', async () => {
    const { here } = renderDataRouter('/tasks?c=c2')
    press('Recent conversations')
    expect(screen.getAllByTestId('dock-recent-row').map((r) => r.textContent)).toEqual([expect.stringContaining('Plan my week')])
    expect(h.listed.at(-1)?.args).toEqual({ home: 'PERSON', projectId: undefined })
    fireEvent.click(screen.getByRole('menuitem', { name: 'All conversations →' }))
    await waitFor(() => expect(here()).toBe('/chat?c=c2'))
  })
})

describe('expanded over the canvas @SC-1032', () => {
  it('hides the canvas, keeps the navigation, and drops back to docked on any navigation', async () => {
    const { here } = renderDataRouter('/projects?c=c1')
    press('Expand over the page')
    expect(dock().dataset.position).toBe('expanded')
    expect(screen.getByTestId('shell-screen').className.split(' ')).toContain('hidden')
    expect(screen.getByTestId('sidebar')).toBeTruthy()
    go('to tasks')
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    expect(dock().dataset.position).toBe('docked')
    expect(screen.getByTestId('shell-screen').className.split(' ')).not.toContain('hidden')
    expect(h.threadMounts).toBe(1)
  })

  it('stays expanded while only the conversation changes', async () => {
    const { here } = renderDataRouter('/projects/AGX?c=c1')
    press('Expand over the page')
    press('Recent conversations')
    fireEvent.click(screen.getAllByTestId('dock-recent-row')[0])
    await waitFor(() => expect(here()).toBe('/projects/AGX?c=c5'))
    expect(dock().dataset.position).toBe('expanded')
    press('Dock beside the page')
    expect(dock().dataset.position).toBe('docked')
  })
})

describe('collapsed to a rail @SC-1033', () => {
  it('shows the agent, a dot while work is under way and the approvals waiting, with the same thread kept mounted', async () => {
    h.activity.c1 = { working: true, needYou: 2 }
    renderDataRouter('/tasks?c=c1')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'half a thought' } })
    press('Collapse (⌘J)')
    expect(dock().dataset.position).toBe('collapsed')
    const rail = screen.getByTestId('dock-rail')
    expect(within(rail).getByTestId('avatar').textContent).toBe('Kernel')
    await waitFor(() => expect(screen.getByTestId('dock-rail-working')).toBeTruthy())
    expect(screen.getByTestId('dock-rail-waiting').textContent).toBe('2')

    fireEvent.click(rail)
    expect(dock().dataset.position).toBe('docked')
    expect(screen.queryByTestId('dock-rail')).toBeNull()
    expect(h.threadMounts).toBe(1)
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('half a thought')
  })

  it('shows no dot and no count when nothing is under way', () => {
    renderDataRouter('/tasks?c=c1')
    press('Collapse (⌘J)')
    expect(screen.queryByTestId('dock-rail-working')).toBeNull()
    expect(screen.queryByTestId('dock-rail-waiting')).toBeNull()
  })

  it('shows the dot the moment a reply starts while collapsed, re-reading nothing on a timer', () => {
    renderDataRouter('/tasks?c=c1')
    press('Collapse (⌘J)')
    expect(screen.queryByTestId('dock-rail-working')).toBeNull()
    fireEvent.click(screen.getByText('a reply starts'))
    expect(screen.getByTestId('dock-rail-working')).toBeTruthy()
    expect(screen.queryByTestId('dock-rail-waiting')).toBeNull()
    expect(h.intervals.filter((i) => i !== undefined)).toEqual([])
  })

  it('⌘J collapses and reopens it, from docked or expanded, never remounting the thread', () => {
    renderDataRouter('/tasks?c=c1')
    const key = () => act(() => { fireEvent.keyDown(window, { key: 'j', metaKey: true }) })
    key()
    expect(dock().dataset.position).toBe('collapsed')
    key()
    expect(dock().dataset.position).toBe('docked')
    press('Expand over the page')
    key()
    expect(dock().dataset.position).toBe('collapsed')
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })
    expect(dock().dataset.position).toBe('docked')
    expect(h.threadMounts).toBe(1)
    expect(screen.getByTestId('thread').getAttribute('data-instance')).toBe('1')
  })

  it('stays collapsed when the canvas moves, and opening a conversation from a list opens the dock', async () => {
    const { here } = renderDataRouter('/projects?c=c2')
    press('Collapse (⌘J)')
    go('to tasks')
    await waitFor(() => expect(here()).toBe('/tasks?c=c2'))
    expect(dock().dataset.position).toBe('collapsed')
    go('open c1')
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    expect(dock().dataset.position).toBe('docked')
  })
})
