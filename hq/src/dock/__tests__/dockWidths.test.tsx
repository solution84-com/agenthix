// @vitest-environment jsdom
/**
 * One model at every width (spec §12, §15): docked beside the canvas when wide; the navigation as icons and the
 * dock sliding over the canvas when medium; on a narrow window folded away, the chat's icon in the top bar opening
 * the conversation full screen. Moving between widths only moves the dock: the same thread, its scroll, unsent text and a streaming reply.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Link } from 'react-router'

const h = vi.hoisted(() => ({ threadMounts: 0, working: false }))
vi.mock('../useConversationInbox', async () => (await import('./dockFakes')).inboxModule)
vi.mock('../useMarkShownRead', async () => (await import('./dockFakes')).markModule)
vi.mock('../pinnedPlaces', async (orig) => (await import('./dockFakes')).pinnedModule(await orig()))
vi.mock('../../shared/components/AppSidebar', () => ({
  AppSidebar: ({ menuIcons }: { menuIcons: boolean }) => (
    <nav data-testid="sidebar" data-collapsed={String(menuIcons)} />
  ),
}))
vi.mock('../../shared/layouts/MobileHeader', () => ({ MobileHeader: () => null }))
vi.mock('../../shared/layouts/ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../../shared/layouts/ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../../shared/layouts/VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span> }))
vi.mock('../../conversations/components/ConversationThread', () => ({
  // Stands in for the thread: its instance, its scrolling list, unsent text, a reply arriving token by token, and
  // what it reports of the work under way in it.
  ConversationThread: ({ conversationId, onActivity }: { conversationId: string; onActivity?: (a: { working: boolean; needYou: number }) => void }) => {
    const [instance] = React.useState(() => ++h.threadMounts)
    const [reply, setReply] = React.useState('')
    React.useEffect(() => { onActivity?.({ working: h.working, needYou: 0 }) }, [onActivity])
    return (
      <div data-testid="thread" data-id={conversationId} data-instance={instance}>
        <div data-testid="thread-scroll">
          <p data-testid="reply">{reply}</p>
        </div>
        <button onClick={() => setReply((r) => `${r}tok `)}>a token arrives</button>
        <textarea aria-label="Message" defaultValue="" />
        <Link to="/tasks">AGX-41</Link>
      </div>
    )
  },
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: undefined }) }))
vi.mock('wasp/client/operations', () => {
  const getConversation = async () => null
  const getConversationActivity = async () => ({ operations: [] })
  return {
    getConversation, getConversationActivity, getProject: async () => null, getTask: async () => null,
    getConversations: async () => [],
    getLastWrittenConversation: async () => null,
    useQuery: (fn: unknown, args: { conversationId?: string }, opts?: { enabled?: boolean }) => {
      if (opts?.enabled === false) return { data: undefined }
      if (fn !== getConversation) return { data: undefined }
      return { data: {
        id: args.conversationId, home: 'PERSON', projectId: null, taskId: null, title: 'Release checklist',
        status: 'ACTIVE', activeTurnId: null, agent: { id: 'a1', name: 'Kernel', avatarUrl: null },
      } }
    },
  }
})

import { renderDataRouter } from './dockHarness'
import { fake, resetFake, row, setInbox } from './dockFakes'

function resizeTo(px: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: px })
    window.dispatchEvent(new Event('resize'))
  })
}
const WIDE = 1440
const MEDIUM = 1000
const NARROW = 400

const dock = () => screen.getByTestId('dock')
const sidebar = () => screen.getByTestId('sidebar')
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const state = (name: string) => fireEvent.click(screen.getByRole('radio', { name }))
const phone = () => screen.getByTestId('dock-phone-button')
const shortcut = () => fireEvent.keyDown(window, { key: 'j', metaKey: true })

beforeEach(() => {
  h.threadMounts = 0
  h.working = false
  try { localStorage.clear() } catch { /* not needed */ }
})
afterEach(() => {
  cleanup()
  resizeTo(1024)
})

describe('which form shows at each width', () => {
  it('wide: docked beside the canvas, a place’s menu at full width @SC-1038', () => {
    resizeTo(WIDE)
    renderDataRouter('/projects?c=c1')
    expect(dock().getAttribute('data-width')).toBe('wide')
    expect(dock().className).not.toContain('fixed')
    expect(sidebar().getAttribute('data-collapsed')).toBe('false')
  })

  it('medium: a place’s menu as icons, the panel sliding over the canvas, minimised to its bar and back @SC-1038', async () => {
    resizeTo(MEDIUM)
    const { here } = renderDataRouter('/projects?c=c1')
    expect(sidebar().getAttribute('data-collapsed')).toBe('true')
    expect(dock().getAttribute('data-width')).toBe('medium')
    expect(dock().className).toContain('fixed')
    expect(screen.getByRole('radio', { name: 'Over the page' })).toBeTruthy()

    state('Minimised (⌘J)')
    expect(dock().getAttribute('data-position')).toBe('collapsed')
    expect(dock().className).not.toContain('fixed')
    expect(screen.getByTestId('dock-bar')).toBeTruthy()
    shortcut()
    expect(dock().getAttribute('data-position')).toBe('docked')

    // Going somewhere slides it away, so the page gone to is in sight.
    fireEvent.click(screen.getByRole('link', { name: 'to tasks' }))
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    expect(dock().getAttribute('data-position')).toBe('collapsed')
    state('Beside the page')
    expect(dock().getAttribute('data-position')).toBe('docked')
    expect(h.threadMounts).toBe(1)
  })

  it('medium: a click on the page puts the sliding dock away, and a click inside it does not', () => {
    resizeTo(MEDIUM)
    renderDataRouter('/projects?c=c1')
    expect(dock().getAttribute('data-position')).toBe('docked')

    fireEvent.mouseDown(screen.getByLabelText('Message'))
    expect(dock().getAttribute('data-position')).toBe('docked')

    fireEvent.mouseDown(screen.getByTestId('projects-page'))
    expect(dock().getAttribute('data-position')).toBe('collapsed')
  })

  it('wide: a click on the page leaves the dock beside it', () => {
    resizeTo(WIDE)
    renderDataRouter('/projects?c=c1')
    fireEvent.mouseDown(screen.getByTestId('projects-page'))
    expect(dock().getAttribute('data-position')).toBe('docked')
  })

  it('narrow: just the conversation full screen, ⌄ folds it away, the chat’s icon in the top bar opens it again @SC-1039', async () => {
    resizeTo(NARROW)
    const { here } = renderDataRouter('/projects?c=c1')
    expect(dock().getAttribute('data-width')).toBe('narrow')
    expect(dock().className).toContain('inset-0')
    expect(screen.queryByTestId('dock-bar')).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Over the page' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Chat menu/ })).toBeTruthy()

    press('Fold the chat away')
    expect(dock().className).toBe('hidden')
    fireEvent.click(phone())
    expect(dock().getAttribute('data-position')).toBe('docked')

    // A link in the conversation opens the work full screen; the icon returns to the conversation.
    fireEvent.click(screen.getByRole('link', { name: 'AGX-41' }))
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    expect(dock().className).toBe('hidden')
    expect(screen.getByText('Tasks page')).toBeTruthy()
    fireEvent.click(phone())
    expect(dock().getAttribute('data-position')).toBe('docked')
  })

  it('narrow: nothing drawn while no conversation is open; opening one from a row shows it full screen @SC-1039', async () => {
    resizeTo(NARROW)
    const { here } = renderDataRouter('/projects')
    expect(screen.queryByTestId('dock')).toBeNull()
    fireEvent.click(screen.getByText('c1 row'))
    await waitFor(() => expect(here()).toBe('/projects?c=c1'))
    expect(dock().getAttribute('data-position')).toBe('docked')
    expect(screen.getByTestId('projects-page')).toBeTruthy()
  })
})

describe('moving between widths @SC-1040', () => {
  it('keeps the same mounted conversation: its scroll, unsent text and a streaming reply', () => {
    resizeTo(WIDE)
    renderDataRouter('/projects?c=c1')
    const scroller = screen.getByTestId('thread-scroll')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'half a thought' } })
    press('a token arrives')

    resizeTo(MEDIUM)
    press('a token arrives')
    resizeTo(NARROW)
    press('Fold the chat away')
    fireEvent.click(phone())
    press('a token arrives')
    resizeTo(MEDIUM)
    resizeTo(WIDE)

    expect(h.threadMounts).toBe(1)
    expect(screen.getByTestId('thread-scroll')).toBe(scroller)
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('half a thought')
    expect(screen.getByTestId('reply').textContent).toBe('tok tok tok ')
  })

  it('keeps expanded and collapsed where they still apply', () => {
    resizeTo(WIDE)
    renderDataRouter('/projects?c=c1')
    state('Over the page')
    resizeTo(MEDIUM)
    expect(dock().getAttribute('data-position')).toBe('expanded')
    expect(screen.getByTestId('shell-screen').classList.contains('hidden')).toBe(true)
    resizeTo(NARROW)
    // Full screen, the canvas is left in place beneath it.
    expect(dock().className).toContain('inset-0')
    expect(screen.getByTestId('shell-screen').classList.contains('hidden')).toBe(false)

    resizeTo(WIDE)
    state('Beside the page')
    state('Minimised (⌘J)')
    resizeTo(MEDIUM)
    expect(dock().className).toContain('w-14')
    resizeTo(NARROW)
    expect(dock().className).toBe('hidden')
    expect(phone()).toBeTruthy()
    resizeTo(WIDE)
    expect(dock().className).toContain('w-14')
    expect(screen.getByTestId('dock-bar')).toBeTruthy()
    expect(h.threadMounts).toBe(1)
  })
})

describe('the phone’s ⋮ menu (the board’s f2)', () => {
  beforeEach(() => {
    resetFake()
    setInbox([row('c5', { needsYou: 1, place: { kind: 'project', id: 'p1', key: 'AGX', name: 'Agenthix' } }), row('c1', { unread: 1 })])
    fake.pinned = [{ id: 'p1', placeId: 'p1', ref: { kind: 'project', key: 'AGX' }, name: 'Agenthix', href: '/projects/AGX', basePath: '/projects/AGX' }]
  })

  it('carries the badge for everything waiting, on the folded icon and on ⋮', () => {
    resizeTo(NARROW)
    renderDataRouter('/projects?c=c1')
    expect(screen.getByRole('button', { name: 'Chat menu, 2 waiting' })).toBeTruthy()
    press('Fold the chat away')
    expect(phone().getAttribute('aria-label')).toBe('Chat, 2 waiting')
  })

  it('opens a sheet; each choice’s sheet replaces it, ‹ goes back to it, and choosing a conversation closes them all', async () => {
    resizeTo(NARROW)
    const { here } = renderDataRouter('/projects?c=c1')
    press('Chat menu, 2 waiting')
    const menu = screen.getByRole('dialog', { name: 'Chat' })
    expect(within(menu).getByRole('button', { name: /^Conversations/ }).textContent).toBe('Conversations2')
    expect(within(menu).getByRole('button', { name: 'New conversation' })).toBeTruthy()
    expect(within(within(menu).getByRole('list', { name: 'Pinned' })).getAllByRole('button').map((b) => b.getAttribute('aria-label')))
      .toEqual(['Your space · 1 unread · 1 conversation', 'Agenthix · 1 needs you · 1 conversation'])
    fireEvent.click(within(menu).getByRole('button', { name: /^Conversations/ }))
    const list = screen.getByRole('dialog', { name: 'Conversations' })
    expect(screen.queryByRole('dialog', { name: 'Chat' })).toBeNull()
    fireEvent.click(within(list).getByRole('button', { name: 'Back to the menu' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Chat' })).getByRole('button', { name: /^Agenthix/ }))
    const place = screen.getByRole('dialog', { name: 'Agenthix' })
    fireEvent.click(within(place).getAllByTestId('inbox-row')[0])
    await waitFor(() => expect(here()).toBe('/projects?c=c5'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(dock().getAttribute('data-position')).toBe('docked')
  })
})
