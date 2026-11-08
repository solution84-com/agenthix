// @vitest-environment jsdom
/**
 * On a narrow window, with the real navigation drawer: folding the conversation away and going
 * somewhere from ☰ moves the canvas once and carries the conversation along, with nothing navigating on its own.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'

const h = vi.hoisted(() => ({ threadMounts: 0, operations: [] as { operationId: string; state: string; createdAt: string }[] }))
vi.mock('../useConversationInbox', async () => (await import('./dockFakes')).inboxModule)
vi.mock('../useMarkShownRead', async () => (await import('./dockFakes')).markModule)
vi.mock('../pinnedPlaces', async (orig) => (await import('./dockFakes')).pinnedModule(await orig()))
vi.mock('../../shared/components/sidebar/OrgSwitcher', () => ({ OrgSwitcher: () => null }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { identities: { username: { id: 'sam' } } } }), logout: () => {} }))
vi.mock('../../shared/layouts/useShellCounts', () => ({ useShellCounts: () => ({ unreadNotifications: 0, runsInProgress: 0, runsNeedingYou: 0 }), formatCount: String }))
vi.mock('../../shared/layouts/ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../../shared/layouts/ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../../shared/layouts/VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span> }))
vi.mock('../../conversations/components/ConversationThread', () => ({
  // Stands in for the thread: how often it is mounted.
  ConversationThread: ({ conversationId }: { conversationId: string }) => {
    React.useState(() => ++h.threadMounts)
    return <div data-testid="thread" data-id={conversationId} />
  },
}))
vi.mock('wasp/client/operations', () => {
  const getConversation = async () => null
  const getConversationActivity = async () => ({ operations: [] })
  return {
    getConversation, getConversationActivity, getProject: async () => null, getTask: async () => null,
    getConversations: async () => [], getOrgIdentity: async () => null, getUserSettings: async () => null,
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

function resizeTo(px: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: px })
    window.dispatchEvent(new Event('resize'))
  })
}
const NARROW = 400

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

beforeEach(() => {
  h.threadMounts = 0
  h.operations = []
  try { localStorage.clear() } catch { /* not needed */ }
})
afterEach(() => {
  cleanup()
  resizeTo(1024)
})

describe('the folded chat and the navigation drawer @SC-1039', () => {
  it('goes somewhere from ☰ in one move, the conversation staying folded away', async () => {
    resizeTo(NARROW)
    const { router } = renderDataRouter('/chat/t/c1')
    await waitFor(() => expect(router.state.location.search).toBe('?c=c1'))
    const moves: string[] = []
    router.subscribe((st) => { moves.push(`${st.historyAction} ${st.location.pathname}${st.location.search}`) })

    press('Fold the chat away')
    press('Open menu')
    await new Promise((r) => setTimeout(r, 50))
    expect(moves).toEqual([])
    expect(screen.getByTestId('nav-drawer-backdrop')).toBeTruthy()

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: /^Your tasks/ }))
    await waitFor(() => expect(router.state.location.search).toBe('?c=c1'))
    await new Promise((r) => setTimeout(r, 50))
    expect(moves).toEqual(['PUSH /tasks', 'REPLACE /tasks?c=c1'])
    expect(screen.getByTestId('dock').className).toBe('hidden')
    // The real frame draws the chat's icon in the phone's top bar, beside the harness's stand-in.
    expect(within(screen.getByTestId('mobile-header')).getByTestId('dock-phone-button')).toBeTruthy()
    expect(screen.queryByTestId('nav-drawer-backdrop')).toBeNull()
    expect(h.threadMounts).toBe(1)
  })
})
