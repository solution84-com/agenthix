// @vitest-environment jsdom
/**
 * The chat beside an open file (R2): on a medium window, where the open chat otherwise slides over the page, a file
 * open in the viewer puts it beside the file instead, so the person can read the file and talk to the agent at once.
 * Minimised, the file takes the width; brought back, the chat is beside the file again, never over it; the choice
 * holds from file to file; closing the viewer puts the chat back as it was before the file opened.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { Link } from 'react-router'

vi.mock('../useConversationInbox', async () => (await import('./dockFakes')).inboxModule)
vi.mock('../useMarkShownRead', async () => (await import('./dockFakes')).markModule)
vi.mock('../pinnedPlaces', async (orig) => (await import('./dockFakes')).pinnedModule(await orig()))
vi.mock('../../shared/components/AppSidebar', () => ({ AppSidebar: () => <nav data-testid="sidebar" /> }))
vi.mock('../../shared/layouts/MobileHeader', () => ({ MobileHeader: () => null }))
vi.mock('../../shared/layouts/ShellPanelHost', () => ({ ShellPanelHost: () => null }))
vi.mock('../../shared/layouts/ShellNotices', () => ({ ShellNotices: () => null }))
vi.mock('../../shared/layouts/VoiceBar', () => ({ VoiceBar: () => null }))
vi.mock('../../shared/components/AuthedAgentAvatar', () => ({ AuthedAgentAvatar: ({ name }: { name: string }) => <span>{name}</span> }))
vi.mock('../../conversations/components/ConversationThread', () => ({
  ConversationThread: ({ conversationId }: { conversationId: string }) => (
    <div data-testid="thread" data-id={conversationId}><textarea aria-label="Message" defaultValue="" /></div>
  ),
}))
// The file itself is not what is tested: a stand-in with the viewer's ‹ back.
vi.mock('../../storage/pages/viewer/ViewerFile', () => ({
  ViewerFile: ({ target, back }: { target: { ref: { path: string } }; back: { label: string; onBack: () => void } }) => (
    <div data-testid="viewer-file" data-path={target.ref.path}>
      <button type="button" onClick={back.onBack}>{`‹ ${back.label}`}</button>
    </div>
  ),
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: undefined }) }))
vi.mock('wasp/client/operations', () => {
  const getConversation = async () => null
  return {
    getConversation, getConversationActivity: async () => ({ operations: [] }), getProject: async () => null, getTask: async () => null,
    getConversations: async () => [], getLastWrittenConversation: async () => null,
    useQuery: (fn: unknown, args: { conversationId?: string }, opts?: { enabled?: boolean }) => {
      if (opts?.enabled === false || fn !== getConversation) return { data: undefined }
      return { data: {
        id: args.conversationId, home: 'PERSON', projectId: null, taskId: null, title: 'Q3 review',
        status: 'ACTIVE', activeTurnId: null, agent: { id: 'a1', name: 'Kernel', avatarUrl: null },
      } }
    },
  }
})

import { renderDataRouter } from './dockHarness'
import { AppShell } from '../../shared/layouts/AppShell'
import { useFileViewer } from '../../storage/pages/viewer/useFileViewer'
import type { ViewerTarget } from '../../storage/pages/viewer/viewerAddress'
import { dockClasses } from '../dockLayout'

const loc = { ownerType: 'user' as const, ownerId: 'u1', workspaceId: null, taskId: null }
const fileAt = (path: string): ViewerTarget => ({
  kind: 'file', ref: { space: 'place', loc, path }, placePath: '/chat', from: { kind: 'conversation' },
})

/** Stands in for a page with chips on it: each opens its file in the viewer, as a chip in the chat does. */
function ReportPage() {
  const { open } = useFileViewer()
  return (
    <AppShell breadcrumbs={[{ label: 'Report' }]}>
      <div data-testid="report-page">
        <button type="button" onClick={() => open(fileAt('report/sales-q3.csv'))}>sales-q3.csv</button>
        <button type="button" onClick={() => open(fileAt('report/notes.md'))}>notes.md</button>
        <Link to="/tasks">to tasks</Link>
      </div>
    </AppShell>
  )
}

function resizeTo(px: number) {
  act(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: px })
    window.dispatchEvent(new Event('resize'))
  })
}
const WIDE = 1440
const MEDIUM = 1100
const NARROW = 400

const dock = () => screen.getByTestId('dock')
const viewer = () => screen.getByTestId('file-viewer')
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const state = (name: string) => fireEvent.click(screen.getByRole('radio', { name }))
const shortcut = () => fireEvent.keyDown(window, { key: 'j', metaKey: true })
const over = () => dock().className.includes('fixed')
const render = () => renderDataRouter('/report?c=c1', [{ path: '/report', element: <ReportPage /> }])

beforeEach(() => {
  try { localStorage.clear() } catch { /* not needed */ }
})
afterEach(() => {
  cleanup()
  resizeTo(1024)
})

describe('where the dock sits with a file open', () => {
  it('beside the file on a medium window; over the page, minimised and full screen as before otherwise', () => {
    expect(dockClasses('medium', 'docked', false)).toContain('fixed')
    expect(dockClasses('medium', 'docked', true)).not.toContain('fixed')
    expect(dockClasses('medium', 'docked', true)).toContain('relative')
    expect(dockClasses('medium', 'collapsed', true)).toBe(dockClasses('medium', 'collapsed', false))
    expect(dockClasses('wide', 'docked', true)).toBe(dockClasses('wide', 'docked', false))
    expect(dockClasses('narrow', 'docked', true)).toBe(dockClasses('narrow', 'docked', false))
    expect(dockClasses('narrow', 'collapsed', true)).toBe('hidden')
  })
})

describe('a medium window with a file open (R2)', () => {
  it('moves the chat from over the page to beside the file, and the viewer stays in the main area', () => {
    resizeTo(MEDIUM)
    render()
    expect(dock().getAttribute('data-position')).toBe('docked')
    expect(over()).toBe(true)
    press('sales-q3.csv')
    expect(viewer()).toBeTruthy()
    expect(dock().getAttribute('data-position')).toBe('docked')
    expect(over()).toBe(false)
    // The viewer covers the main area only, not the whole window as on a phone.
    expect(viewer().className).toContain('absolute')
    expect(viewer().className).not.toContain('fixed')
    // Beside the file, the chat's width can be dragged.
    expect(screen.getByRole('separator')).toBeTruthy()
  })

  it('a click in the file leaves the chat beside it', () => {
    resizeTo(MEDIUM)
    render()
    press('sales-q3.csv')
    fireEvent.mouseDown(screen.getByTestId('viewer-file'))
    expect(dock().getAttribute('data-position')).toBe('docked')
  })

  it('minimised, the file has the width; brought back, the chat is beside it; the choice holds from file to file', () => {
    resizeTo(MEDIUM)
    const { here } = render()
    press('sales-q3.csv')
    shortcut()
    expect(dock().getAttribute('data-position')).toBe('collapsed')
    expect(dock().className).toContain('w-14')

    press('notes.md')
    expect(screen.getByTestId('viewer-file').getAttribute('data-path')).toBe('report/notes.md')
    expect(dock().getAttribute('data-position')).toBe('collapsed')

    state('Beside the page')
    expect(dock().getAttribute('data-position')).toBe('docked')
    expect(over()).toBe(false)
    press('sales-q3.csv')
    expect(dock().getAttribute('data-position')).toBe('docked')
    expect(over()).toBe(false)
    expect(here()).toContain('c=c1')
  })

  it('closing the file puts the chat back as it was before the file opened', () => {
    resizeTo(MEDIUM)
    render()
    press('sales-q3.csv')
    shortcut()
    press('‹ Conversation')
    expect(screen.queryByTestId('file-viewer')).toBeNull()
    expect(dock().getAttribute('data-position')).toBe('docked')
    expect(over()).toBe(true)
  })

  it('a chat minimised before the file opened stays minimised, and is minimised again once the file closes', () => {
    resizeTo(MEDIUM)
    render()
    shortcut()
    press('sales-q3.csv')
    expect(dock().getAttribute('data-position')).toBe('collapsed')
    state('Beside the page')
    expect(over()).toBe(false)
    press('‹ Conversation')
    expect(dock().getAttribute('data-position')).toBe('collapsed')
  })

  it('going to another page from the viewer follows the page’s rule, not the viewer’s', async () => {
    resizeTo(MEDIUM)
    const { router } = render()
    press('sales-q3.csv')
    await act(async () => { await router.navigate('/tasks?c=c1') })
    await waitFor(() => expect(screen.getByText('Tasks page')).toBeTruthy())
    expect(screen.queryByTestId('file-viewer')).toBeNull()
    expect(dock().getAttribute('data-position')).toBe('collapsed')
  })
})

describe('over the page while a file is open', () => {
  it('is greyed, with why in its tooltip; an expanded chat drops beside the file and goes back to expanded after', () => {
    resizeTo(WIDE)
    render()
    state('Over the page')
    expect(dock().getAttribute('data-position')).toBe('expanded')
    // The page is out of sight behind the expanded chat; a chip in the chat opens the file the same way.
    act(() => { (screen.getByRole('button', { name: 'sales-q3.csv' }) as HTMLButtonElement).click() })
    expect(dock().getAttribute('data-position')).toBe('docked')
    const overThePage = screen.getByRole('radio', { name: 'Over the page' })
    expect(overThePage.getAttribute('aria-disabled')).toBe('true')
    expect(overThePage.title).toBe('Close the file to put the chat over the page.')
    fireEvent.click(overThePage)
    expect(dock().getAttribute('data-position')).toBe('docked')
    press('‹ Conversation')
    expect(dock().getAttribute('data-position')).toBe('expanded')
    expect(screen.getByRole('radio', { name: 'Over the page' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('going to another page from the viewer does not put the chat back over the page', async () => {
    resizeTo(WIDE)
    const { router } = render()
    state('Over the page')
    act(() => { (screen.getByRole('button', { name: 'sales-q3.csv' }) as HTMLButtonElement).click() })
    await act(async () => { await router.navigate('/tasks?c=c1') })
    await waitFor(() => expect(screen.getByText('Tasks page')).toBeTruthy())
    expect(dock().getAttribute('data-position')).toBe('docked')
  })
})

describe('the other widths are unchanged', () => {
  it('wide: the chat stays beside the file', () => {
    resizeTo(WIDE)
    render()
    press('sales-q3.csv')
    expect(over()).toBe(false)
    expect(viewer().className).toContain('absolute')
  })

  it('narrow: the viewer is the whole screen, over the chat', () => {
    resizeTo(NARROW)
    render()
    press('Fold the chat away')
    act(() => { (screen.getByRole('button', { name: 'sales-q3.csv' }) as HTMLButtonElement).click() })
    expect(viewer().className).toContain('fixed')
    expect(viewer().className).toContain('z-50')
    expect(dock().className).toBe('hidden')
  })
})
