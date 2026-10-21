// @vitest-environment jsdom
/**
 * The dock is drawn once, in the root shell (spec §2, §14, §15): its thread is never remounted while the canvas
 * changes, links in it open in the canvas, and deleting or archiving it from the dock closes the dock while the
 * canvas stays.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { Link, useNavigate } from 'react-router'

type View = { id: string; home: string; projectId: string | null; taskId: string | null; title: string | null; status: string }
const h = vi.hoisted(() => ({
  threadMounts: 0,
  views: {} as Record<string, View>,
}))
vi.mock('../../shared/components/AppSidebar', () => ({ AppSidebar: () => <nav data-testid="sidebar" /> }))
vi.mock('../../pins/components/PinnedFoot', () => ({ PinnedFoot: () => null }))
vi.mock('../../shared/layouts/MobileHeader', () => ({ MobileHeader: () => null }))
vi.mock('../../shared/layouts/ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../../shared/layouts/ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../../shared/layouts/VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../../shared/hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../useDockWidth', () => ({ useDockWidth: () => 'wide' }))
vi.mock('../../conversations/components/ConversationThread', async () => {
  const { useCardPlace } = await vi.importActual<typeof import('../../agents/profile/cardPlace')>('../../agents/profile/cardPlace')
  return {
    // Stands in for the thread: what it keeps (its instance, unsent text), its links, and what it does once the person
    // deleted or archived the conversation: tells the dock, or else goes to `listPath`.
    ConversationThread: ({ conversationId, listPath, onDeleted, onArchived }: {
      conversationId: string; listPath: string; onDeleted?: () => void; onArchived?: () => void
    }) => {
      const [instance] = React.useState(() => ++h.threadMounts)
      const navigate = useNavigate()
      const card = useCardPlace()
      return (
        <div data-testid="thread" data-id={conversationId} data-instance={instance} data-list={listPath} data-card={card ? JSON.stringify(card) : ''}>
          <textarea aria-label="Message" defaultValue="" />
          <Link to="/tasks">AGX-41</Link>
          <Link to={listPath}>its list</Link>
          <button onClick={() => (onDeleted ? onDeleted() : navigate(listPath))}>delete it</button>
          <button onClick={() => (onArchived ? onArchived() : navigate(listPath))}>archive it</button>
        </div>
      )
    },
  }
})
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: undefined }) }))
vi.mock('wasp/client/operations', () => {
  const getConversation = async () => null
  const getProject = async () => null
  const getTask = async () => null
  return {
    getConversation, getProject, getTask,
    getLastWrittenConversation: async () => null,
    useQuery: (fn: unknown, args: Record<string, string>, opts?: { enabled?: boolean }) => {
      if (opts?.enabled === false) return { data: undefined }
      if (fn === getConversation) return { data: h.views[args.conversationId] }
      if (fn === getProject && args.projectId === 'p1') return { data: { key: 'AGX', name: 'Agenthix', personalOwnerId: null } }
      if (fn === getTask && args.taskId === 't1') return { data: { title: 'Ship it', number: 41, project: { key: 'AGX' } } }
      return { data: undefined }
    },
  }
})

import { renderDataRouter } from './dockHarness'

const go = (name: string) => fireEvent.click(screen.getByRole('link', { name }))
const thread = () => screen.getByTestId('thread')
const view = (id: string, home: string, more: Partial<View> = {}): View =>
  ({ id, home, projectId: null, taskId: null, title: `Talk ${id}`, status: 'ACTIVE', ...more })

beforeEach(() => {
  h.threadMounts = 0
  h.views = {
    c1: view('c1', 'PERSON'),
    c2: view('c2', 'PROJECT', { projectId: 'p1' }),
    c4: view('c4', 'TASK', { projectId: 'p1', taskId: 't1' }),
  }
})
afterEach(cleanup)

describe('the dock stays mounted @SC-1029', () => {
  it('keeps the same thread and its unsent text through every change of the canvas', async () => {
    const { here } = renderDataRouter('/projects?c=c1')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'half a thought' } })
    for (const to of ['to tasks', 'to home', 'to bare', 'to projects']) {
      go(to)
      await waitFor(() => expect(here()).toContain('c=c1'))
    }
    expect(h.threadMounts).toBe(1)
    expect(thread().getAttribute('data-instance')).toBe('1')
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('half a thought')
  })

  it('opens a link in the conversation in the canvas, the conversation staying', async () => {
    const { here } = renderDataRouter('/projects?c=c1')
    go('AGX-41')
    await waitFor(() => expect(here()).toBe('/tasks?c=c1'))
    expect(screen.getByText('Tasks page')).toBeTruthy()
    expect(thread().getAttribute('data-id')).toBe('c1')
    expect(h.threadMounts).toBe(1)
  })
})

describe('the dock’s header @SC-1028', () => {
  it('shows the place chip: your space, a project or a task', async () => {
    renderDataRouter('/tasks?c=c1')
    expect(screen.getByTestId('dock-place-chip').textContent).toBe('Your space')
    expect(screen.getByTestId('dock-place-chip').getAttribute('href')).toBe('/space')
    expect(thread().getAttribute('data-list')).toBe('/chat')

    go('open c2')
    await waitFor(() => expect(screen.getByTestId('dock-place-chip').textContent).toBe('Agenthix'))
    expect(screen.getByTestId('dock-place-chip').getAttribute('href')).toBe('/projects/AGX')
    expect(thread().getAttribute('data-list')).toBe('/projects/AGX')
  })

  it('gives an agent’s card in the thread the conversation’s place, wherever the canvas is', async () => {
    renderDataRouter('/tasks?c=c1')
    expect(JSON.parse(thread().dataset.card!)).toEqual({ kind: 'chat', basePath: '/chat', path: '/space' })
    go('open c2')
    await waitFor(() => expect(thread().dataset.id).toBe('c2'))
    expect(JSON.parse(thread().dataset.card!)).toEqual({
      kind: 'project', projectId: 'p1', basePath: '/projects/AGX', path: '/projects/AGX',
      sessionLocation: { primaryOwnerType: 'project', primaryOwnerId: 'p1' },
    })
    go('to tasks')
    await waitFor(() => expect(thread().dataset.id).toBe('c2'))
    expect(JSON.parse(thread().dataset.card!).projectId).toBe('p1')
  })

  it('names a task’s conversation by its task', () => {
    renderDataRouter('/tasks?c=c4')
    expect(screen.getByTestId('dock-place-chip').textContent).toBe('Ship it')
    expect(screen.getByTestId('dock-place-chip').getAttribute('href')).toBe('/tasks/AGX-41')
  })
})

describe('deleting or archiving from the dock @SC-1030', () => {
  it('closes the dock after a delete, and the canvas stays', async () => {
    const { here } = renderDataRouter('/projects?c=c1')
    fireEvent.click(screen.getByText('delete it'))
    await waitFor(() => expect(screen.queryByTestId('dock')).toBeNull())
    expect(here()).toBe('/projects')
    expect(screen.getByTestId('projects-page')).toBeTruthy()
  })

  it('closes the dock after archiving, and the canvas stays', async () => {
    const { here } = renderDataRouter('/tasks?c=c1')
    fireEvent.click(screen.getByText('archive it'))
    await waitFor(() => expect(screen.queryByTestId('dock')).toBeNull())
    expect(here()).toBe('/tasks')
  })

  it('lets a link to the conversation’s list open in the canvas, the conversation staying', async () => {
    const { here } = renderDataRouter('/tasks?c=c1')
    fireEvent.click(screen.getByText('its list'))
    await waitFor(() => expect(here()).toBe('/chat?c=c1'))
    expect(thread().getAttribute('data-id')).toBe('c1')
  })
})
