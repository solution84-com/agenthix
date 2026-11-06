// @vitest-environment jsdom
/**
 * The dock is never empty (spec §2): with nothing open, it opens the conversation the person last wrote in, or a new
 * one in their space; on a medium or narrow window put away, so the page shows first. A conversation the address
 * names, or one just deleted from the dock, is never replaced by it.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  width: 'wide' as 'wide' | 'medium' | 'narrow',
  last: undefined as { conversationId: string } | null | undefined,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) { h.listeners.add(listener); return () => { h.listeners.delete(listener) } },
  answer(last: { conversationId: string } | null) { h.last = last; h.listeners.forEach((l) => l()) },
}))
vi.mock('../useConversationInbox', async () => (await import('./dockFakes')).inboxModule)
vi.mock('../useMarkShownRead', async () => (await import('./dockFakes')).markModule)
vi.mock('../pinnedPlaces', async (orig) => (await import('./dockFakes')).pinnedModule(await orig()))
vi.mock('../../shared/components/AppSidebar', () => ({ AppSidebar: () => <nav data-testid="sidebar" /> }))
vi.mock('../../shared/layouts/MobileHeader', () => ({ MobileHeader: () => null }))
vi.mock('../../shared/layouts/ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../../shared/layouts/ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../../shared/layouts/VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../../shared/hooks/useIsMobile', () => ({ useIsMobile: () => h.width === 'narrow' }))
vi.mock('../useDockWidth', () => ({ useDockWidth: () => h.width }))
vi.mock('../DockNewConversation', () => ({ DockNewConversation: () => <div data-testid="new-box" /> }))
vi.mock('../../conversations/components/ConversationThread', () => ({
  ConversationThread: ({ conversationId, onDeleted }: { conversationId: string; onDeleted?: () => void }) => (
    <div data-testid="thread" data-id={conversationId}>
      <button onClick={onDeleted}>delete it</button>
    </div>
  ),
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/operations', () => {
  const getConversation = async () => null
  const getLastWrittenConversation = async () => null
  return {
    getConversation, getLastWrittenConversation, getProject: async () => null, getTask: async () => null,
    useQuery: (fn: unknown, args: Record<string, string> | undefined, opts?: { enabled?: boolean }) => {
      if (opts?.enabled === false) return { data: undefined }
      // Answers when the test says, as the real query does when the server replies.
      if (fn === getLastWrittenConversation) return { data: React.useSyncExternalStore(h.subscribe, () => h.last) }
      if (fn === getConversation) return { data: { id: args!.conversationId, home: 'PERSON', projectId: null, taskId: null, title: 'T', status: 'ACTIVE' } }
      return { data: undefined }
    },
  }
})

import { renderDataRouter } from './dockHarness'

const dock = () => screen.getByTestId('dock')

beforeEach(() => {
  h.width = 'wide'
  h.last = { conversationId: 'c9' }
})
afterEach(cleanup)

describe('with nothing open, the dock fills itself', () => {
  it('opens the conversation last written in, beside the page, and puts it in the address', async () => {
    const { here } = renderDataRouter('/projects')
    await waitFor(() => expect(screen.getByTestId('thread').dataset.id).toBe('c9'))
    expect(dock().dataset.position).toBe('docked')
    expect(here()).toBe('/projects?c=c9')
  })

  it('starts a new conversation in your space when there is none to open', async () => {
    h.last = null
    renderDataRouter('/projects')
    await waitFor(() => expect(screen.getByTestId('new-box')).toBeTruthy())
    expect(screen.queryByTestId('thread')).toBeNull()
  })

  it('waits until it is known which, and never replaces one the address names', () => {
    h.last = undefined
    renderDataRouter('/projects')
    expect(screen.queryByTestId('dock')).toBeNull()
    cleanup()
    h.last = { conversationId: 'c9' }
    renderDataRouter('/projects?c=c1')
    expect(screen.getByTestId('thread').dataset.id).toBe('c1')
  })

  it('never replaces a page the person is already on their way to', async () => {
    h.last = undefined
    // The page is slow the first time only: the dock's own move to it afterwards loads it again.
    let arrive = () => {}
    let arrived = false
    const slow = {
      path: '/slow',
      loader: () => arrived ? null : new Promise<null>((resolve) => { arrive = () => { arrived = true; resolve(null) } }),
      element: <span>slow page</span>,
    }
    const { router, here } = renderDataRouter('/projects', [slow])
    act(() => { void router.navigate('/slow') })
    act(() => h.answer({ conversationId: 'c9' }))
    expect(here()).toBe('/projects')
    await act(async () => arrive())
    await waitFor(() => expect(here()).toBe('/slow?c=c9'))
    expect(screen.getByTestId('thread').dataset.id).toBe('c9')
  })

  it('is folded away on a narrow window, so the page shows first, the chat’s icon in the top bar', async () => {
    h.width = 'narrow'
    renderDataRouter('/projects')
    await waitFor(() => expect(dock().dataset.position).toBe('collapsed'))
    expect(dock().className).toBe('hidden')
    expect(screen.getByTestId('dock-phone-button')).toBeTruthy()
  })

  it('does not open again the conversation just deleted from it', async () => {
    renderDataRouter('/projects')
    await waitFor(() => expect(screen.getByTestId('thread').dataset.id).toBe('c9'))
    fireEvent.click(screen.getByRole('button', { name: 'delete it' }))
    await waitFor(() => expect(screen.getByTestId('new-box')).toBeTruthy())
    expect(screen.queryByTestId('thread')).toBeNull()
  })
})
