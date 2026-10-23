// @vitest-environment jsdom
/**
 * A new conversation is a draft in the dock (spec §10, the board `new-conversation.html`): ＋ or *Talk about*
 * swaps the dock to a draft and remembers what was open; Cancel or Esc puts it back — the same mounted thread —
 * or closes the dock; the draft's area is the list of places, the current one selected and the box focused;
 * choosing a place hands it to a fresh box; sending turns the draft into the conversation.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useNavigate } from 'react-router'

type View = { id: string; home: string; projectId: string | null; taskId: string | null; title: string | null; status: string; agent: { id: string; name: string; avatarUrl: null } }
const h = vi.hoisted(() => ({
  threadMounts: 0,
  boxMounts: 0,
  width: 'wide' as 'wide' | 'medium' | 'narrow',
  views: {} as Record<string, View>,
  // The agents each place's box offers, by project id ('' for your space), its primary agent first.
  agents: { p1: ['Kernel', 'Coder'], p2: ['Writer'], p4: ['Analyst'], p5: ['Kernel'], '': ['Kernel', 'Coder'] } as Record<string, string[]>,
}))
vi.mock('../../shared/components/AppSidebar', () => ({ AppSidebar: () => <nav data-testid="sidebar" /> }))
vi.mock('../../pins/components/PinnedFoot', () => ({ PinnedFoot: () => null }))
vi.mock('../../shared/layouts/MobileHeader', () => ({ MobileHeader: () => null }))
vi.mock('../../shared/layouts/ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../../shared/layouts/ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../../shared/layouts/VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../../shared/hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../useDockWidth', () => ({ useDockWidth: () => h.width }))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span> }))
vi.mock('../../conversations/components/ConversationThread', () => ({
  ConversationThread: ({ conversationId }: { conversationId: string }) => {
    const [instance] = React.useState(() => ++h.threadMounts)
    return (
      <div data-testid="thread" data-id={conversationId} data-instance={instance}>
        <textarea aria-label="Message" defaultValue="" />
      </div>
    )
  },
}))
vi.mock('../../conversations/components/NewConversationBox', () => ({
  // Stands in for the box: the place and agent it was given, its own focus and unsent text, its agent picker, which
  // reports the agent it starts with and each one picked, and what it does on sending.
  NewConversationBox: ({ home, projectId, basePath, autoFocus, agentId, onAgentChange }: {
    home: string; projectId?: string; basePath: string; autoFocus?: boolean; agentId?: string
    onAgentChange?: (agent: { id: string; name: string } | null) => void
  }) => {
    const [instance] = React.useState(() => ++h.boxMounts)
    const navigate = useNavigate()
    const choices = h.agents[projectId ?? ''].map((name) => ({ id: `a-${name}`, name }))
    const [picked, setPicked] = React.useState<string | null>(null)
    const current = choices.find((a) => a.id === (picked ?? agentId)) ?? choices[0]
    React.useEffect(() => { onAgentChange?.(current) }, [current.id, onAgentChange])
    return (
      <div data-testid="new-box" data-home={home} data-project={projectId ?? ''} data-base={basePath} data-instance={instance} data-agent={current.id}>
        <textarea aria-label="New message" defaultValue="" autoFocus={autoFocus} />
        {choices.map((a) => <button key={a.id} onClick={() => setPicked(a.id)}>pick {a.name}</button>)}
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
  const getPins = async () => []
  const getConversations = async () => []
  const getConversationActivity = async () => ({ operations: [] })
  const projects: Record<string, { id: string; key: string; name: string; personalOwnerId: string | null }> = {
    AGX: { id: 'p1', key: 'AGX', name: 'Agenthix', personalOwnerId: null },
    WEB: { id: 'p2', key: 'WEB', name: 'Website relaunch', personalOwnerId: null },
    QRT: { id: 'p4', key: 'QRT', name: 'Quarterly report', personalOwnerId: null },
    CUS: { id: 'p5', key: 'CUS', name: 'Customer research', personalOwnerId: null },
  }
  return {
    getConversation, getProject, getTask, getProjectByKey, getProjects, getPins, getConversations, getConversationActivity,
    getLastWrittenConversation: async () => null,
    useQuery: (fn: unknown, args: Record<string, string> | undefined, opts?: { enabled?: boolean }) => {
      if (opts?.enabled === false) return { data: undefined }
      if (fn === getConversation) return { data: h.views[args!.conversationId] }
      if (fn === getConversationActivity) return { data: { operations: [] } }
      if (fn === getProject && args?.projectId === 'p1') return { data: { key: 'AGX', name: 'Agenthix', personalOwnerId: null } }
      if (fn === getProjectByKey) return { data: projects[args!.key] }
      if (fn === getProjects) {
        return { data: [
          { id: 'pp', key: 'ME', name: 'Mine', personalOwnerId: 'u1', personalSpace: true, isMember: true },
          ...Object.values(projects).map((p) => ({ ...p, isMember: true })),
          { id: 'p3', key: 'OPEN', name: 'Not mine', personalOwnerId: null, isMember: false },
        ] }
      }
      if (fn === getPins) {
        return { data: [
          { id: 'pin1', kind: 'PROJECT', itemId: 'p2', name: 'Website relaunch', href: '/projects/WEB', avatarUrl: null },
          { id: 'pin2', kind: 'BOARD', itemId: 'b1', name: 'Roadmap board', href: '/projects/AGX/boards/b1', avatarUrl: null },
          { id: 'pin3', kind: 'PROJECT', itemId: 'p3', name: 'Not mine', href: '/projects/OPEN', avatarUrl: null },
        ] }
      }
      return { data: undefined }
    },
  }
})

import { renderDataRouter } from './dockHarness'

const dock = () => screen.getByTestId('dock')
const press = (name: string | RegExp) => fireEvent.click(within(dock()).getByRole('button', { name }))
const box = () => screen.getByTestId('new-box')
const thread = () => screen.getByTestId('thread')
const places = () => screen.getByRole('listbox', { name: 'Places' })
const search = () => screen.getByRole('combobox', { name: 'Find a place' })
/** The list as read: group headings and place names, the selected one marked. */
const listed = () => Array.from(places().querySelectorAll('[data-group], [role="option"]')).map((el) =>
  el.getAttribute('role') === 'option'
    ? `${el.getAttribute('aria-selected') === 'true' ? '* ' : ''}${el.querySelector('[data-name]')?.textContent}`
    : `# ${el.textContent}`)
const view = (id: string, home: string, more: Partial<View> = {}): View =>
  ({ id, home, projectId: null, taskId: null, title: `Talk ${id}`, status: 'ACTIVE', agent: { id: 'k', name: 'Kernel', avatarUrl: null }, ...more })

beforeEach(() => {
  h.threadMounts = 0
  h.boxMounts = 0
  h.width = 'wide'
  h.views = { c1: view('c1', 'PERSON'), c9: view('c9', 'PROJECT', { projectId: 'p1' }) }
})
afterEach(cleanup)

describe('the draft and Cancel @SC-1035', () => {
  it('＋ swaps the dock to a draft; Cancel puts back the same mounted conversation with its unsent text', async () => {
    const { here } = renderDataRouter('/tasks?c=c1')
    const before = thread()
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'half a thought' } })
    press('New conversation')
    await waitFor(() => expect(here()).toBe('/tasks'))
    expect(thread().closest('.hidden')).not.toBeNull()
    expect(within(screen.getByTestId('dock-header')).getByRole('heading').textContent).toBe('New conversation')
    expect(within(screen.getByTestId('dock-header')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel'])

    fireEvent.change(screen.getByLabelText('New message'), { target: { value: 'not sent' } })
    press('Cancel')
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    expect(screen.queryByTestId('new-box')).toBeNull()
    expect(thread()).toBe(before)
    expect(thread().closest('.hidden')).toBeNull()
    expect(h.threadMounts).toBe(1)
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('half a thought')

    press('New conversation')
    expect((screen.getByLabelText('New message') as HTMLTextAreaElement).value).toBe('')
  })

  it('Esc cancels, and with nothing open before the draft is put away to the rail: the dock is never empty', async () => {
    renderDataRouter('/projects/AGX')
    fireEvent.click(screen.getByRole('button', { name: 'Talk about Agenthix' }))
    expect(box()).toBeTruthy()
    fireEvent.keyDown(screen.getByLabelText('New message'), { key: 'Escape' })
    expect(dock().dataset.position).toBe('collapsed')
    expect(screen.getByTestId('dock-rail')).toBeTruthy()
  })

  it('puts back the position too: expanded, or collapsed to the rail', () => {
    renderDataRouter('/projects/AGX?c=c1')
    press('Expand over the page')
    press('New conversation')
    press('Cancel')
    expect(dock().dataset.position).toBe('expanded')
    press('Collapse (⌘J)')
    fireEvent.click(screen.getByRole('button', { name: 'Talk about Agenthix' }))
    expect(dock().dataset.position).toBe('docked')
    press('Cancel')
    expect(dock().dataset.position).toBe('collapsed')
    expect(screen.getByTestId('dock-rail')).toBeTruthy()
    expect(h.threadMounts).toBe(1)
  })

  it('Back from the draft returns to the conversation that was open, still mounted', async () => {
    const { router, here } = renderDataRouter('/tasks?c=c1')
    press('New conversation')
    await waitFor(() => expect(here()).toBe('/tasks'))
    await act(async () => { await router.navigate(-1) })
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    // The router's location changes before React draws it, so the page is waited for too.
    await waitFor(() => expect(screen.queryByTestId('new-box')).toBeNull())
    expect(thread().closest('.hidden')).toBeNull()
    expect(h.threadMounts).toBe(1)
  })
})

describe('the list of places @SC-1036', () => {
  it('in a project: that project is selected with its explanation, then your space, pinned, all A–Z; the box has focus', () => {
    renderDataRouter('/projects/AGX?c=c1')
    press('New conversation')
    expect(listed()).toEqual([
      "# You're here", '* Agenthix', 'Your space',
      '# Pinned', 'Website relaunch',
      '# All projects', 'Customer research', 'Quarterly report',
    ])
    const explained = places().querySelectorAll('[data-explanation]')
    expect(Array.from(explained).map((e) => e.textContent))
      .toEqual(["A project. Works in its files, with its agents. Others in it can see it's running, not what's said."])
    expect(document.activeElement).toBe(screen.getByLabelText('New message'))
    expect(box().dataset).toMatchObject({ home: 'PROJECT', project: 'p1', base: '/projects/AGX' })
    expect(screen.getByTestId('dock-draft-lead').textContent).toBe("Kernel leads it. It can use Agenthix's files and tools.")
  })

  it('outside a project: your space is selected, with its own explanation and line', () => {
    renderDataRouter('/tasks?c=c1')
    press('New conversation')
    expect(listed()).toEqual([
      "# You're here", '* Your space',
      '# Pinned', 'Website relaunch',
      '# All projects', 'Agenthix', 'Customer research', 'Quarterly report',
    ])
    expect(places().querySelector('[data-explanation]')?.textContent).toBe('Private to you. Works in your own files.')
    expect(screen.getByTestId('dock-draft-lead').textContent).toBe('Kernel leads it. It can use your own files.')
    expect(box().dataset).toMatchObject({ home: 'PERSON', base: '/chat' })
  })

  it('choosing another place hands it to a fresh box, and the explanation and line follow', () => {
    renderDataRouter('/projects/AGX?c=c1')
    press('New conversation')
    fireEvent.click(within(places()).getByRole('option', { name: /Website relaunch/ }))
    expect(box().dataset).toMatchObject({ home: 'PROJECT', project: 'p2', base: '/projects/WEB', instance: '2' })
    expect(listed()).toContain('* Website relaunch')
    expect(listed()[1]).toBe('Agenthix')
    expect(within(places()).getByRole('option', { name: /Website relaunch/ }).querySelector('[data-explanation]')).not.toBeNull()
    expect(screen.getByTestId('dock-draft-lead').textContent).toBe("Writer leads it. It can use Website relaunch's files and tools.")
    fireEvent.click(within(places()).getByRole('option', { name: /Your space/ }))
    expect(box().dataset).toMatchObject({ home: 'PERSON', base: '/chat', instance: '3' })
  })

  it('the line names the agent picked in the box, not only the one it starts with', () => {
    renderDataRouter('/projects/AGX?c=c1')
    press('New conversation')
    expect(screen.getByTestId('dock-draft-lead').textContent).toBe("Kernel leads it. It can use Agenthix's files and tools.")
    fireEvent.click(screen.getByText('pick Coder'))
    expect(screen.getByTestId('dock-draft-lead').textContent).toBe("Coder leads it. It can use Agenthix's files and tools.")
  })

  it('*Talk to <agent>* on an agent’s page starts one with that agent, in your space, the canvas staying @SC-1024', async () => {
    const { here } = renderDataRouter('/agents/coder?c=c1')
    fireEvent.click(screen.getByRole('button', { name: 'Talk to Coder' }))
    expect(box().dataset).toMatchObject({ home: 'PERSON', base: '/chat', agent: 'a-Coder' })
    expect(listed()).toContain('* Your space')
    expect(screen.getByTestId('dock-draft-lead').textContent).toBe('Coder leads it. It can use your own files.')
    await waitFor(() => expect(here()).toBe('/agents/coder'))
    expect(screen.getByText('Agent page')).toBeTruthy()
  })

  it('searching filters without moving the selection, which stays in view; no match says so', () => {
    renderDataRouter('/projects/AGX?c=c1')
    press('New conversation')
    fireEvent.change(search(), { target: { value: 'rep' } })
    expect(listed()).toEqual(['# Matches', 'Quarterly report', '# Selected', '* Agenthix'])
    expect(within(places()).getByRole('option', { name: /Agenthix/ }).textContent).toContain("you're here")
    expect(box().dataset).toMatchObject({ project: 'p1', instance: '1' })

    fireEvent.change(search(), { target: { value: 'agent' } })
    expect(listed()).toEqual(['# Matches', '* Agenthix'])

    fireEvent.change(search(), { target: { value: 'zzz' } })
    expect(screen.getByText("No place called 'zzz'. You can only start in places you're a member of.")).toBeTruthy()
    expect(listed()).toEqual(['# Selected', '* Agenthix'])
    expect(box().dataset).toMatchObject({ project: 'p1', instance: '1' })
  })

  it('arrow keys move through the list from search, and Enter chooses', () => {
    renderDataRouter('/projects/AGX?c=c1')
    press('New conversation')
    fireEvent.change(search(), { target: { value: 'r' } })
    expect(listed().slice(0, 4)).toEqual(['# Matches', 'Your space', 'Website relaunch', 'Customer research'])
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    fireEvent.keyDown(search(), { key: 'ArrowUp' })
    expect(search().getAttribute('aria-activedescendant')).toBe(within(places()).getByRole('option', { name: /Website relaunch/ }).id)
    fireEvent.keyDown(search(), { key: 'Enter' })
    expect(box().dataset).toMatchObject({ project: 'p2' })
    expect((search() as HTMLInputElement).value).toBe('')
    expect(listed()).toContain('* Website relaunch')
  })
})

describe('sending @SC-1037', () => {
  it('turns the draft into the conversation in the dock, its place as the chip and the buttons back', async () => {
    const { here } = renderDataRouter('/projects/AGX?c=c1')
    press('New conversation')
    fireEvent.click(screen.getByText('send it'))
    await waitFor(() => expect(here()).toBe('/projects/AGX?c=c9'))
    expect(screen.queryByTestId('new-box')).toBeNull()
    expect(screen.queryByRole('listbox', { name: 'Places' })).toBeNull()
    expect(thread().dataset.id).toBe('c9')
    const header = screen.getByTestId('dock-header')
    expect(within(header).getByTestId('dock-place-chip').textContent).toBe('Agenthix')
    expect(within(header).getAllByRole('button').map((b) => b.getAttribute('aria-label')))
      .toEqual(['Recent conversations', 'New conversation', 'Expand over the page', 'Collapse (⌘J)'])
  })
})

describe('on a phone @SC-1039', () => {
  it('the draft is full screen with Cancel only; Cancel goes back to the pill, with nothing open too', () => {
    h.width = 'narrow'
    renderDataRouter('/projects/AGX?c=c1')
    press('Back to the page')
    expect(screen.getByTestId('dock-pill')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Talk about Agenthix' }))
    expect(dock().dataset.position).toBe('docked')
    expect(within(screen.getByTestId('dock-header')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel'])
    press('Cancel')
    expect(screen.getByTestId('dock-pill')).toBeTruthy()
    expect(h.threadMounts).toBe(1)
    cleanup()

    renderDataRouter('/projects/AGX')
    fireEvent.click(screen.getByRole('button', { name: 'Talk about Agenthix' }))
    press('Cancel')
    expect(screen.getByTestId('dock-pill')).toBeTruthy()
  })
})
