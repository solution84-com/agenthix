// @vitest-environment jsdom
/**
 * The open conversation belongs to the shell and the address carries it (spec §1, §3): `?c=` on every page, and a
 * conversation's own address read and replaced by that form, the canvas staying where it was when reached from
 * inside hq.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ width: 'wide' as 'wide' | 'medium' | 'narrow', threadMounts: 0 }))
vi.mock('../useConversationInbox', async () => (await import('./dockFakes')).inboxModule)
vi.mock('../useMarkShownRead', async () => (await import('./dockFakes')).markModule)
vi.mock('../pinnedPlaces', async (orig) => (await import('./dockFakes')).pinnedModule(await orig()))
vi.mock('../../shared/components/AppSidebar', () => ({ AppSidebar: () => <nav data-testid="sidebar" /> }))
vi.mock('../../shared/layouts/MobileHeader', () => ({ MobileHeader: () => null }))
vi.mock('../../shared/layouts/ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../../shared/layouts/ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../../shared/layouts/VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../../shared/hooks/useIsMobile', () => ({ useIsMobile: () => h.width !== 'wide' }))
vi.mock('../useDockWidth', () => ({ useDockWidth: () => h.width }))
vi.mock('../../conversations/components/ConversationThread', () => ({
  ConversationThread: ({ conversationId }: { conversationId: string }) => {
    const [instance] = React.useState(() => ++h.threadMounts)
    return <div data-testid="thread" data-id={conversationId} data-instance={instance} />
  },
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: undefined }) }))
vi.mock('wasp/client/operations', () => {
  const getConversation = async () => ({ status: 'ACTIVE' })
  return {
    getConversation, getProject: async () => null, getTask: async () => null,
    getLastWrittenConversation: async () => null,
    useQuery: (fn: unknown, args: { conversationId?: string }, opts?: { enabled?: boolean }) =>
      opts?.enabled === false || fn !== getConversation
        ? { data: undefined }
        : { data: { id: args.conversationId, home: 'PERSON', projectId: null, taskId: null, title: `Talk ${args.conversationId}` } },
  }
})

import { canvasMounts, renderDataRouter, renderPlainRouter } from './dockHarness'

const go = (name: string) => fireEvent.click(screen.getByRole('link', { name }))
const thread = () => screen.queryByTestId('thread')

beforeEach(() => {
  h.width = 'wide'
  h.threadMounts = 0
  canvasMounts.projects = 0
  canvasMounts.home = 0
})
afterEach(cleanup)

describe('the open conversation in the address @SC-1026', () => {
  it('opens the conversation an address names, and puts it back on every page a link leads to', async () => {
    const { router, here } = renderDataRouter('/projects?c=c1')
    expect(thread()?.getAttribute('data-id')).toBe('c1')
    go('to tasks')
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    go('to bare')
    await waitFor(() => expect(here()).toBe('/bare?c=c1'))
    expect(h.threadMounts).toBe(1)
    // Put back by replacing, so Back goes to the page before, as it was.
    await act(() => router.navigate(-1))
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    await act(() => router.navigate(-1))
    await waitFor(() => expect(here()).toBe('/projects?c=c1'))
  })

  it('draws no dock while no conversation is open, and leaves the address alone', async () => {
    const { here } = renderDataRouter('/projects')
    expect(screen.queryByTestId('dock')).toBeNull()
    go('to tasks')
    await waitFor(() => expect(here()).toBe('/tasks'))
  })

  it('follows Back to a page that named another conversation', async () => {
    const { router, here } = renderDataRouter('/projects?c=c1')
    go('open c2')
    await waitFor(() => expect(thread()?.getAttribute('data-id')).toBe('c2'))
    await act(() => router.navigate(-1))
    await waitFor(() => expect(thread()?.getAttribute('data-id')).toBe('c1'))
    expect(here()).toBe('/projects?c=c1')
  })
})

describe('a conversation’s own address @SC-1027', () => {
  it('reached from inside hq, opens it in the dock and keeps the canvas as it was, never remounted', async () => {
    const { here } = renderDataRouter('/projects')
    fireEvent.change(screen.getByLabelText('Filter projects'), { target: { value: 'agx' } })
    fireEvent.click(screen.getByRole('link', { name: 'c1 row' }))
    await waitFor(() => expect(here()).toBe('/projects?c=c1'))
    expect(thread()?.getAttribute('data-id')).toBe('c1')
    expect(canvasMounts.projects).toBe(1)
    expect((screen.getByLabelText('Filter projects') as HTMLInputElement).value).toBe('agx')
  })

  it('switching to another keeps the canvas and swaps the thread', async () => {
    const { here } = renderDataRouter('/tasks?c=c1')
    go('open c2')
    await waitFor(() => expect(here()).toBe('/tasks?c=c2'))
    expect(thread()?.getAttribute('data-id')).toBe('c2')
  })

  it('sent from Home’s box, opens the new conversation in the dock with Home staying, never remounted', async () => {
    const { here } = renderDataRouter('/')
    fireEvent.click(screen.getByText('send from home'))
    await waitFor(() => expect(here()).toBe('/?c=c3'))
    expect(thread()?.getAttribute('data-id')).toBe('c3')
    expect(canvasMounts.home).toBe(1)
    expect(screen.getByRole('button', { name: 'send from home' })).toBeTruthy()
  })

  it('on a fresh load, shows the conversation’s place on its Conversations section', async () => {
    const chat = renderDataRouter('/chat/t/c1')
    await waitFor(() => expect(chat.here()).toBe('/chat?c=c1'))
    expect(thread()?.getAttribute('data-id')).toBe('c1')
    cleanup()
    const project = renderDataRouter('/projects/AGX/t/c2')
    await waitFor(() => expect(project.here()).toBe('/projects/AGX?tool=conversations&c=c2'))
    expect(thread()?.getAttribute('data-id')).toBe('c2')
  })

  it('under a router that cannot stop a navigation, returns the canvas to where the person was', async () => {
    const { here } = renderPlainRouter('/tasks')
    go('open c1')
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    expect(thread()?.getAttribute('data-id')).toBe('c1')
  })

  it.each(['medium', 'narrow'] as const)('on a %s window too, opens it in the dock with the canvas staying', async (width) => {
    h.width = width
    const { here } = renderDataRouter('/projects')
    go('open c1')
    await waitFor(() => expect(here()).toBe('/projects?c=c1'))
    expect(screen.getByTestId('projects-page')).toBeTruthy()
    expect(screen.queryByText('Chat thread page')).toBeNull()
    expect(thread()?.getAttribute('data-id')).toBe('c1')
    expect(screen.getByTestId('dock').getAttribute('data-width')).toBe(width)
  })

  it.each(['medium', 'narrow'] as const)('on a %s window, a fresh load of a conversation’s address opens it, not put away', async (width) => {
    h.width = width
    const { here } = renderDataRouter('/chat/t/c1')
    await waitFor(() => expect(here()).toBe('/chat?c=c1'))
    expect(screen.getByTestId('dock').getAttribute('data-position')).toBe('docked')
  })
})
