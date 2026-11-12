// @vitest-environment jsdom
/**
 * The dock can be dragged wider (spec §12, W2-1): a separator on its inner edge, limits, the browser remembering the
 * width, the keyboard, and the conversation never remounting during a drag.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { Link } from 'react-router'

const h = vi.hoisted(() => ({ threadMounts: 0, operations: [] as { operationId: string; state: string; createdAt: string }[] }))
vi.mock('../useConversationInbox', async () => (await import('./dockFakes')).inboxModule)
vi.mock('../useMarkShownRead', async () => (await import('./dockFakes')).markModule)
vi.mock('../pinnedPlaces', async (orig) => (await import('./dockFakes')).pinnedModule(await orig()))
vi.mock('../../shared/components/AppSidebar', () => ({
  AppSidebar: ({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse?: () => void }) => (
    <nav data-testid="sidebar" data-collapsed={String(collapsed)} data-toggle={String(!!onToggleCollapse)} />
  ),
}))
vi.mock('../../shared/layouts/MobileHeader', () => ({ MobileHeader: () => null }))
vi.mock('../../shared/layouts/ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../../shared/layouts/ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../../shared/layouts/VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span> }))
vi.mock('../../conversations/components/ConversationThread', async () => {
  const { PanelMenu } = await import('./dockPanelHelpers')
  return {
  // Stands in for the thread: its instance, its scrolling list, unsent text, and a reply arriving token by token.
  ConversationThread: ({ conversationId }: { conversationId: string }) => {
    const [instance] = React.useState(() => ++h.threadMounts)
    const [reply, setReply] = React.useState('')
    return (
      <div data-testid="thread" data-id={conversationId} data-instance={instance}>
        <div data-testid="thread-scroll">
          <p data-testid="reply">{reply}</p>
        </div>
        <button onClick={() => setReply((r) => `${r}tok `)}>a token arrives</button>
        <textarea aria-label="Message" defaultValue="" /><PanelMenu />
        <Link to="/tasks">AGX-41</Link>
      </div>
    )
  },
} })
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: undefined }) }))
vi.mock('wasp/client/operations', () => {
  const getConversation = async () => null
  const getConversationActivity = async () => ({ operations: [] })
  return {
    getDemoInfo: 'getDemoInfo',
    getConversation, getConversationActivity, getProject: async () => null, getTask: async () => null,
    getConversations: async () => [],
    getLastWrittenConversation: async () => null,
    useQuery: (fn: unknown, args: { conversationId?: string }, opts?: { enabled?: boolean }) => {
      if (opts?.enabled === false) return { data: undefined }
      if (fn === getConversationActivity) return { data: { operations: h.operations } }
      if (fn !== getConversation) return { data: undefined }
      return { data: {
        id: args.conversationId, home: 'PERSON', projectId: null, taskId: null, title: 'Release checklist',
        status: 'ACTIVE', activeTurnId: null, agent: { id: 'a1', name: 'Kernel', avatarUrl: null },
      } }
    },
  }
})

import { renderDataRouter } from './dockHarness'
import { state } from './dockPanelHelpers'

function resizeTo(px: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: px })
    window.dispatchEvent(new Event('resize'))
  })
}
const KEY = 'dock-width'
const dock = () => screen.getByTestId('dock')
const handle = () => screen.getByRole('separator', { name: 'Resize the conversation' })
const widthOf = () => dock().style.width
const stored = () => localStorage.getItem(KEY)

// jsdom has no pointer events; a mouse event carries the same coordinates.
beforeEach(() => {
  h.threadMounts = 0
  h.operations = []
  ;(window as unknown as { PointerEvent: unknown }).PointerEvent = MouseEvent
  try { localStorage.clear() } catch { /* not needed */ }
  resizeTo(1600)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resizeTo(1024)
})

function drag(to: number) {
  fireEvent.pointerDown(handle(), { clientX: 1200, pointerId: 1, button: 0 })
  fireEvent.pointerMove(handle(), { clientX: to, pointerId: 1 })
  fireEvent.pointerUp(handle(), { clientX: to, pointerId: 1 })
}

describe('the handle @SC-1034', () => {
  it('is a vertical separator with its value and limits, focusable', () => {
    renderDataRouter('/projects?c=c1')
    expect(handle().getAttribute('aria-orientation')).toBe('vertical')
    expect(handle().getAttribute('aria-valuenow')).toBe('400')
    expect(handle().getAttribute('aria-valuemin')).toBe('400')
    expect(handle().getAttribute('aria-valuemax')).toBe('720')
    expect(handle().getAttribute('tabindex')).toBe('0')
  })

  it('shows beside the page and sliding over it, not when expanded, put away, or narrow', () => {
    renderDataRouter('/projects?c=c1')
    expect(screen.queryByRole('separator', { name: 'Resize the conversation' })).toBeTruthy()
    resizeTo(1000)
    expect(screen.queryByRole('separator', { name: 'Resize the conversation' })).toBeTruthy()
    state('Over the page')
    expect(screen.queryByRole('separator', { name: 'Resize the conversation' })).toBeNull()
    state('Beside the page')
    state('Minimised (⌘J)')
    expect(screen.queryByRole('separator', { name: 'Resize the conversation' })).toBeNull()
    fireEvent.keyDown(window, { key: 'j', metaKey: true })
    resizeTo(400)
    expect(screen.queryByRole('separator', { name: 'Resize the conversation' })).toBeNull()
  })
})

describe('width and its limits @SC-1034', () => {
  it('dragging the inner edge left widens it, and the width is written only when the drag ends', () => {
    renderDataRouter('/projects?c=c1')
    expect(widthOf()).toBe('400px')
    fireEvent.pointerDown(handle(), { clientX: 1200, pointerId: 1, button: 0 })
    fireEvent.pointerMove(handle(), { clientX: 1000, pointerId: 1 })
    expect(widthOf()).toBe('600px')
    expect(stored()).toBeNull()
    fireEvent.pointerUp(handle(), { clientX: 1000, pointerId: 1 })
    expect(stored()).toBe('600')
  })

  it('never goes under the default width or over the fixed maximum', () => {
    renderDataRouter('/projects?c=c1')
    drag(1590)
    expect(widthOf()).toBe('400px')
    drag(100)
    expect(widthOf()).toBe('720px')
    expect(stored()).toBe('720')
  })

  it('leaves the canvas room: at most half of a medium window', () => {
    resizeTo(1000)
    renderDataRouter('/projects?c=c1')
    expect(handle().getAttribute('aria-valuemax')).toBe('500')
    drag(0)
    expect(widthOf()).toBe('500px')
  })

  it('a window too small for a stored width clamps it without overwriting it, and it comes back', () => {
    localStorage.setItem(KEY, '700')
    renderDataRouter('/projects?c=c1')
    expect(widthOf()).toBe('700px')
    resizeTo(1000)
    expect(widthOf()).toBe('500px')
    expect(stored()).toBe('700')
    resizeTo(1600)
    expect(widthOf()).toBe('700px')
  })
})

describe('remembered in this browser @SC-1034', () => {
  it('is read on load', () => {
    localStorage.setItem(KEY, '560')
    renderDataRouter('/projects?c=c1')
    expect(widthOf()).toBe('560px')
  })

  it('ignores a stored value that is not a number', () => {
    localStorage.setItem(KEY, 'wide')
    renderDataRouter('/projects?c=c1')
    expect(widthOf()).toBe('400px')
  })

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    renderDataRouter('/projects?c=c1')
    expect(widthOf()).toBe('400px')
    drag(1000)
    expect(widthOf()).toBe('600px')
  })
})

describe('keyboard and reset @SC-1034', () => {
  it('the arrow keys change the width in steps and are remembered; Home and End go to the limits', () => {
    renderDataRouter('/projects?c=c1')
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' })
    expect(widthOf()).toBe('424px')
    expect(handle().getAttribute('aria-valuenow')).toBe('424')
    expect(stored()).toBe('424')
    fireEvent.keyDown(handle(), { key: 'ArrowRight' })
    fireEvent.keyDown(handle(), { key: 'ArrowRight' })
    expect(widthOf()).toBe('400px')
    fireEvent.keyDown(handle(), { key: 'End' })
    expect(widthOf()).toBe('720px')
    fireEvent.keyDown(handle(), { key: 'Home' })
    expect(widthOf()).toBe('400px')
  })

  it('a double click resets to the default width', () => {
    localStorage.setItem(KEY, '640')
    renderDataRouter('/projects?c=c1')
    fireEvent.doubleClick(handle())
    expect(widthOf()).toBe('400px')
    expect(stored()).toBe('400')
  })
})

describe('the conversation while it is dragged @SC-1034', () => {
  it('is never remounted, and the page does not select text under the drag', () => {
    renderDataRouter('/projects?c=c1')
    fireEvent.click(screen.getByRole('button', { name: 'a token arrives' }))
    fireEvent.pointerDown(handle(), { clientX: 1200, pointerId: 1, button: 0 })
    expect(document.body.style.userSelect).toBe('none')
    fireEvent.pointerMove(handle(), { clientX: 900, pointerId: 1 })
    fireEvent.pointerUp(handle(), { clientX: 900, pointerId: 1 })
    expect(document.body.style.userSelect).toBe('')
    expect(h.threadMounts).toBe(1)
    expect(screen.getByTestId('reply').textContent).toBe('tok ')
  })
})
