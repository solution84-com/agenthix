// @vitest-environment jsdom
/**
 * The file viewer (the file viewer's *One file viewer, one rule*): the open file is in the address, so Back closes the
 * viewer and the address, copied, opens it again; full screen has its own way out (C1).
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, Folder: icon, ChevronLeft: icon, MoreHorizontal: icon, Download: icon, Maximize2: icon, PanelLeft: icon, X: icon }
})
const ops = vi.hoisted(() => ({
  openFile: vi.fn(), openFiles: vi.fn(), openTaskAttachment: vi.fn(),
  getFileFacts: 'getFileFacts', getTaskAttachments: 'getTaskAttachments', getProjects: 'getProjects',
  projects: undefined as { id: string; name: string }[] | undefined,
  useQuery: (op: string) => ({ data: op === 'getProjects' ? ops.projects : undefined, isLoading: false, error: null }),
}))
vi.mock('wasp/client/operations', () => ops)

import { FileViewerHost } from '../FileViewerHost'
import { useFileViewer } from '../useFileViewer'
import { viewerTargetOf, withViewer, writeViewerTarget, type ViewerTarget } from '../viewerAddress'
import { FullScreenFile } from '../../openedFileParts'
import { breadcrumbOf } from '../viewerFileParts'

const loc = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null, taskId: null }
const report: ViewerTarget = {
  kind: 'file', ref: { space: 'place', loc, path: 'reports/q3.md' }, placePath: '/projects/QR', from: { kind: 'task', taskKey: 'QR-1' },
}

let here = ''
function Where() {
  const at = useLocation()
  here = `${at.pathname}${at.search}`
  return null
}

function Opener({ target }: { target: ViewerTarget }) {
  const { open } = useFileViewer()
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => open(target)}>open it</button>
      <button type="button" onClick={() => navigate(-1)}>browser back</button>
    </>
  )
}

function app(entries: string[] = ['/projects/QR?tool=tasks&task=QR-1']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <p>the task page</p>
      <Opener target={report} />
      <FileViewerHost pageTitle="Tasks" />
      <Where />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  ops.openFile.mockReturnValue(new Promise(() => {}))
  ops.projects = undefined
})
afterEach(cleanup)

describe('the viewer\'s address @SC-1870', () => {
  it('reads back what it writes, keeping the page\'s own parameters', () => {
    const search = withViewer('?tool=tasks&task=QR-1', report)
    const params = new URLSearchParams(search)
    expect(params.get('tool')).toBe('tasks')
    expect(viewerTargetOf(search)).toEqual(report)
    expect(withViewer(search, null)).toBe('?tool=tasks&task=QR-1')
  })

  it('drops a target changed by hand into something that is not a file of a place', () => {
    const bad = (v: unknown) => viewerTargetOf(`?open=${encodeURIComponent(btoa(JSON.stringify(v)))}`)
    expect(bad({ ...report, ref: { space: 'place', loc, path: '../../etc/passwd' } })).toBeNull()
    expect(bad({ ...report, ref: { space: 'upload', path: 'tasks/x' } })).toBeNull()
    expect(bad({ kind: 'attachment', taskId: 't1', taskKey: 'not a key', id: 'a1' })).toBeNull()
    expect(viewerTargetOf('?open=%%%')).toBeNull()
    // A place's address that is not one stays unknown, and ‹ back names only what it can.
    expect(bad({ ...report, placePath: 'https://elsewhere.example', from: { kind: 'task', taskKey: '<b>' } }))
      .toEqual({ ...report, placePath: null, from: { kind: 'page' } })
  })
})

describe('opening, Back and a link @SC-1540 @SC-1869 @SC-1870', () => {
  it('opens over the page, which stays, with ‹ back named for where the person came from', () => {
    app()
    expect(screen.queryByTestId('file-viewer')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'open it' }))
    expect(screen.getByTestId('file-viewer')).toBeTruthy()
    expect(screen.getByText('the task page')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'QR-1' })).toBeTruthy()
    expect(viewerTargetOf(new URL(here, 'http://x').search)).toEqual(report)
  })

  it('the browser\'s Back closes it, back on the page as it was', () => {
    app()
    fireEvent.click(screen.getByRole('button', { name: 'open it' }))
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
    expect(screen.queryByTestId('file-viewer')).toBeNull()
    expect(here).toBe('/projects/QR?tool=tasks&task=QR-1')
  })

  it('‹ back closes it by going back, so Back afterwards does not reopen it', () => {
    app(['/projects', '/projects/QR?tool=tasks&task=QR-1'])
    fireEvent.click(screen.getByRole('button', { name: 'open it' }))
    fireEvent.click(screen.getByRole('button', { name: 'QR-1' }))
    expect(screen.queryByTestId('file-viewer')).toBeNull()
    expect(here).toBe('/projects/QR?tool=tasks&task=QR-1')
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
    expect(here).toBe('/projects')
  })

  it('a copied address opens the same file in the viewer, and ‹ back leaves the page under it', () => {
    app([`/projects/QR?tool=tasks&task=QR-1&open=${writeViewerTarget(report)}`])
    expect(screen.getByTestId('file-viewer')).toBeTruthy()
    expect(ops.openFile).toHaveBeenCalledWith({ file: report.kind === 'file' ? report.ref : null })
    fireEvent.click(screen.getByRole('button', { name: 'QR-1' }))
    expect(screen.queryByTestId('file-viewer')).toBeNull()
    expect(here).toBe('/projects/QR?tool=tasks&task=QR-1')
  })

  it('names ‹ back by the page under it when the person came from no conversation or task @SC-1871', () => {
    app([`/projects/QR?open=${writeViewerTarget({ ...report, from: { kind: 'page' } })}`])
    expect(screen.getByRole('button', { name: 'Tasks' })).toBeTruthy()
  })
})

describe('full screen has a way out (C1) @SC-1872', () => {
  it('draws its own header, with ‹ Back to the viewer and ✕, and Escape closes it', () => {
    const onClose = vi.fn()
    render(<FullScreenFile frame={{ answer: undefined, name: 'q3.md', onReopen: () => {} }} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'q3.md' })
    expect(dialog.querySelector('h3')?.textContent).toBe('q3.md')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the viewer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenCalledTimes(3)
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull()
  })
})

describe('full screen\'s Escape with a menu open @SC-1872', () => {
  it('closes the menu only, and the next Escape closes full screen', () => {
    const onClose = vi.fn()
    render(<FullScreenFile frame={{ answer: undefined, name: 'q3.md', onReopen: () => {}, onCopyLink: () => {} }} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'More actions' }).getAttribute('aria-expanded')).toBe('false')
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('a file outside the page\'s own place starts its breadcrumb with the place @SC-1873', () => {
  const user: { ownerType: 'user' | 'project'; ownerId: string; workspaceId: null; taskId: null } = { ownerType: 'user', ownerId: 'u1', workspaceId: null, taskId: null }
  // placePath is the conversation's own list ("/chat" for Your space), not the page the viewer is over.
  const at = (placePath: string | null, loc = user): Extract<ViewerTarget, { kind: 'file' }> =>
    ({ kind: 'file', ref: { space: 'place', loc, path: 'report/q3.md' }, placePath, from: { kind: 'page' } })
  it('names Your space over a project page, and not over its own', () => {
    expect(breadcrumbOf(at('/chat'), { page: '/projects/QR' })).toEqual(['Your space', 'Files', 'report'])
    expect(breadcrumbOf(at('/chat'), { page: '/space' })).toEqual(['Files', 'report'])
    expect(breadcrumbOf(at('/chat'), { page: '/chat' })).toEqual(['Files', 'report'])
  })
  it('names the project over another page', () => {
    const project = { ...user, ownerType: 'project' as const, ownerId: 'p1' }
    expect(breadcrumbOf(at('/projects/QR', project), { project: 'Q3 review', page: '/chat' })).toEqual(['Q3 review', 'Files', 'report'])
    expect(breadcrumbOf(at('/projects/QR', project), { project: 'Q3 review', page: '/projects/QR' })).toEqual(['Files', 'report'])
  })
})

describe('a file that isn\'t there names the place it was looked in (L11) @SC-1874', () => {
  const missing = (target: ViewerTarget) => {
    ops.openFile.mockResolvedValue({ state: 'not-found' })
    return render(
      <MemoryRouter initialEntries={[`/chat?open=${writeViewerTarget(target)}`]}>
        <FileViewerHost pageTitle="Chat" />
      </MemoryRouter>,
    )
  }
  const file = (owner: { ownerType: 'user' | 'project'; ownerId: string; workspaceId: null; taskId: null }): ViewerTarget => ({
    kind: 'file', ref: { space: 'place', loc: owner, path: 'report/q3-sales-report.md' }, placePath: '/chat', from: { kind: 'conversation' },
  })

  it('in Your space', async () => {
    missing(file({ ...loc, ownerType: 'user', ownerId: 'u1' }))
    expect(await screen.findByText("There's no file at report/q3-sales-report.md in Your space.")).toBeTruthy()
  })

  it('in a project, by the project\'s name', async () => {
    ops.projects = [{ id: 'p2', name: 'Other' }, { id: 'p1', name: 'Q3 review' }]
    missing(file(loc))
    expect(await screen.findByText("There's no file at report/q3-sales-report.md in Q3 review's files.")).toBeTruthy()
  })
})
