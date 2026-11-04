// @vitest-environment jsdom
/**
 * One model at every width (spec §12, §15): docked beside the canvas when wide; the navigation as icons and the
 * dock sliding over the canvas when medium; a pill at the bottom when narrow, the conversation full screen when
 * tapped. Moving between widths only moves the dock: the same thread, its scroll, unsent text and a streaming reply.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { Link } from 'react-router'

const h = vi.hoisted(() => ({ threadMounts: 0, working: false }))
vi.mock('../../shared/components/AppSidebar', () => ({
  AppSidebar: ({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse?: () => void }) => (
    <nav data-testid="sidebar" data-collapsed={String(collapsed)} data-toggle={String(!!onToggleCollapse)} />
  ),
}))
vi.mock('../../pins/components/PinnedFoot', () => ({ PinnedFoot: () => null }))
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
  it('wide: docked beside the canvas, the navigation as the person set it @SC-1038', () => {
    resizeTo(WIDE)
    renderDataRouter('/projects?c=c1')
    expect(dock().getAttribute('data-width')).toBe('wide')
    expect(dock().className).not.toContain('fixed')
    expect(sidebar().getAttribute('data-collapsed')).toBe('false')
    expect(sidebar().getAttribute('data-toggle')).toBe('true')
  })

  it('medium: the navigation as icons, the dock sliding over the canvas, put away to its rail and back @SC-1038', async () => {
    resizeTo(MEDIUM)
    const { here } = renderDataRouter('/projects?c=c1')
    expect(sidebar().getAttribute('data-collapsed')).toBe('true')
    expect(sidebar().getAttribute('data-toggle')).toBe('false')
    expect(dock().getAttribute('data-width')).toBe('medium')
    expect(dock().className).toContain('fixed')
    expect(screen.getByRole('button', { name: 'Expand over the page' })).toBeTruthy()

    press('Collapse (⌘J)')
    expect(dock().getAttribute('data-position')).toBe('collapsed')
    expect(dock().className).not.toContain('fixed')
    expect(screen.getByTestId('dock-rail')).toBeTruthy()
    shortcut()
    expect(dock().getAttribute('data-position')).toBe('docked')

    // Going somewhere slides it away, so the page gone to is in sight.
    fireEvent.click(screen.getByRole('link', { name: 'to tasks' }))
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    expect(dock().getAttribute('data-position')).toBe('collapsed')
    fireEvent.click(screen.getByTestId('dock-rail'))
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

  it('narrow: the conversation full screen, ‹ puts it away to a pill with its agent, title and work dot @SC-1039', async () => {
    resizeTo(NARROW)
    h.working = true
    const { here } = renderDataRouter('/projects?c=c1')
    expect(dock().getAttribute('data-width')).toBe('narrow')
    expect(dock().className).toContain('inset-0')
    expect(screen.queryByRole('button', { name: 'Expand over the page' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Collapse (⌘J)' })).toBeNull()

    press('Back to the page')
    const pill = screen.getByTestId('dock-pill')
    expect(pill.textContent).toContain('Kernel')
    expect(pill.textContent).toContain('Release checklist')
    expect(screen.getByTestId('dock-pill-working')).toBeTruthy()
    expect(dock().className).not.toContain('fixed')

    fireEvent.click(pill)
    expect(dock().getAttribute('data-position')).toBe('docked')
    expect(screen.queryByTestId('dock-pill')).toBeNull()

    // A link in the conversation opens the work full screen; the pill returns to the conversation.
    fireEvent.click(screen.getByRole('link', { name: 'AGX-41' }))
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    expect(screen.getByTestId('dock-pill')).toBeTruthy()
    expect(screen.getByText('Tasks page')).toBeTruthy()
  })

  it('narrow: no pill while no conversation is open; opening one from a row shows it full screen @SC-1039', async () => {
    resizeTo(NARROW)
    const { here } = renderDataRouter('/projects')
    expect(screen.queryByTestId('dock')).toBeNull()
    expect(screen.queryByTestId('dock-pill')).toBeNull()
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
    press('Back to the page')
    fireEvent.click(screen.getByTestId('dock-pill'))
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
    press('Expand over the page')
    resizeTo(MEDIUM)
    expect(dock().getAttribute('data-position')).toBe('expanded')
    expect(screen.getByTestId('shell-screen').classList.contains('hidden')).toBe(true)
    resizeTo(NARROW)
    // Full screen, the canvas is left in place beneath it.
    expect(dock().className).toContain('inset-0')
    expect(screen.getByTestId('shell-screen').classList.contains('hidden')).toBe(false)

    resizeTo(WIDE)
    press('Dock beside the page')
    press('Collapse (⌘J)')
    resizeTo(MEDIUM)
    expect(screen.getByTestId('dock-rail')).toBeTruthy()
    resizeTo(NARROW)
    expect(screen.getByTestId('dock-pill')).toBeTruthy()
    resizeTo(WIDE)
    expect(screen.getByTestId('dock-rail')).toBeTruthy()
    expect(h.threadMounts).toBe(1)
  })
})
