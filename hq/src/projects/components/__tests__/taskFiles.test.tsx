// @vitest-environment jsdom
/** A task's files open beside it (spec part 3, *A task's files*; board T1): attachments, working files, and their link. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// ui resolves its own copy of lucide-react where it has one; its icons are stubbed by that path (see fileFrameInTools).
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, Folder: icon, ChevronLeft: icon, MoreHorizontal: icon, Download: icon }
})

const ops = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  queried: [] as { op: string; args: unknown }[],
  openFile: vi.fn(),
  openFiles: vi.fn(),
  openTaskAttachment: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  getTaskAttachments: 'getTaskAttachments', uploadTaskAttachment: 'uploadTaskAttachment', getFilesPlace: 'getFilesPlace',
  listLocationFiles: 'listLocationFiles',
  useQuery: (op: string, args: unknown) => { ops.queried.push({ op, args }); return { data: ops.data[op], isLoading: false, error: ops.data[`${op}:error`] ?? null } },
  useAction: () => vi.fn(),
  openFile: ops.openFile, openFiles: ops.openFiles, openTaskAttachment: ops.openTaskAttachment,
}))
vi.mock('../../../shared/utils/agentImageUrl', () => ({ fileLink: vi.fn() }))

import { TaskOpenedFile, taskFileLink, FILE_GONE } from '../TaskOpenedFile'
import { TaskWorkingFiles } from '../TaskWorkingFiles'
import { TaskAttachments } from '../TaskAttachments'
import { TaskBesideFile } from '../TaskBesideFile'

const loc = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null, taskId: 't1' }
const PREVIEW = 'https://files.example.com/t/hdr.preview.sig'
const DOWNLOAD = 'https://files.example.com/t/hdr.download.sig'
const ready = (name: string, kind: string, size: number) => ({
  state: 'ready', facts: { name, size, version: 'v1', contentType: 'text/markdown', kind },
  previewLink: PREVIEW, downloadLink: DOWNLOAD, expiresAt: Date.now() + 300_000,
})

function relayServing(body: string) {
  const bytes = new TextEncoder().encode(body)
  vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('Range') ?? 'bytes=0-0')!.map(Number)
    const last = Math.min(end!, bytes.length - 1)
    return new Response(bytes.slice(start, last + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${last}/${bytes.length}` } })
  }))
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  ops.data = {}
  ops.queried = []
})
afterEach(() => vi.unstubAllGlobals())

function opened(file: React.ComponentProps<typeof TaskOpenedFile>['file'], layout: 'narrow' | 'wide' = 'wide') {
  const props = { file, taskId: 't1', taskKey: 'WEB-42', loc, layout, onClose: vi.fn(), onOpenWorking: vi.fn() }
  render(<TaskOpenedFile {...props} />)
  return props
}

describe('an attachment opened beside the task @SC-1559', () => {
  it('opens through HQ\'s attachment action and draws in the frame, with Download on the relay', async () => {
    ops.data.getTaskAttachments = [{ id: 'att1', uuid: 'u1', fileName: 'q3.md', fileSizeBytes: 20 }]
    ops.openTaskAttachment.mockResolvedValue(ready('q3.md', 'markdown', 20))
    relayServing('# Q3 report\n\nGrew 6%.')
    opened({ kind: 'attachment', id: 'att1' })
    expect(await screen.findByRole('heading', { name: 'Q3 report' })).toBeTruthy()
    expect(ops.openTaskAttachment).toHaveBeenCalledWith({ attachmentId: 'att1' })
    expect(ops.openFile).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Download' }).getAttribute('href')).toBe(DOWNLOAD)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toBe('WEB-42 › Attachments › q3.md')
  })

  it('wide, ✕ closes it', async () => {
    ops.openTaskAttachment.mockResolvedValue(ready('q3.md', 'markdown', 2))
    relayServing('hi')
    const props = opened({ kind: 'attachment', id: 'att1' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onClose).toHaveBeenCalled()
  })

  it('narrow, it covers the task with ‹ back to it', async () => {
    ops.openTaskAttachment.mockResolvedValue(ready('q3.md', 'markdown', 2))
    relayServing('hi')
    const props = opened({ kind: 'attachment', id: 'att1' }, 'narrow')
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /WEB-42/ }))
    expect(props.onClose).toHaveBeenCalled()
  })
})

describe('a working file opened beside the task @SC-1559', () => {
  it('opens through the open action in the task\'s own folder', async () => {
    ops.openFile.mockResolvedValue(ready('notes.md', 'markdown', 9))
    relayServing('# Notes\n')
    opened({ kind: 'working', path: 'drafts/notes.md' })
    expect(await screen.findByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(ops.openFile).toHaveBeenCalledWith({ file: { space: 'place', loc, path: 'drafts/notes.md' } })
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toBe('WEB-42 › Working files › drafts › notes.md')
  })

  it('says a file that\'s gone isn\'t here any more, with its folder', async () => {
    ops.openFile.mockResolvedValue({ state: 'not-found' })
    opened({ kind: 'working', path: 'charts/q3.png' })
    expect(await screen.findByText(`${FILE_GONE}.`)).toBeTruthy()
    expect(screen.getByText('It was in WEB-42 › Working files › charts.')).toBeTruthy()
  })

  it('Copy link copies the task link form, never a ticket @SC-1561', async () => {
    ops.openFile.mockResolvedValue(ready('notes.md', 'markdown', 9))
    relayServing('# Notes\n')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    opened({ kind: 'working', path: 'drafts/notes.md' })
    await screen.findByRole('heading', { name: 'Notes' })
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' })) })
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/projects/WEB?task=WEB-42&file=drafts%2Fnotes.md`)
  })
})

describe('the task link form @SC-1561', () => {
  it('names the project, the task and the file', () => {
    expect(taskFileLink('WEB-42', { kind: 'working', path: 'notes.md' }, 'https://hq.example.com'))
      .toBe('https://hq.example.com/projects/WEB?task=WEB-42&file=notes.md')
    expect(taskFileLink('WEB-42', { kind: 'attachment', id: 'att1' }, 'https://hq.example.com'))
      .toBe('https://hq.example.com/projects/WEB?task=WEB-42&attachment=att1')
  })
})

describe('the task\'s working files @SC-1560', () => {
  it('say nothing when the folder is empty', () => {
    ops.data.listLocationFiles = { entries: [] }
    const { container } = render(<TaskWorkingFiles loc={loc} onOpen={vi.fn()} />)
    expect(container.textContent).toBe('')
  })

  it('list the task\'s own folder, step into a folder, and open a file by its path in the folder', () => {
    ops.data.listLocationFiles = { entries: [{ name: 'charts', isDir: true }, { name: 'notes.md', isDir: false, size: 9 }] }
    const onOpen = vi.fn()
    render(<TaskWorkingFiles loc={loc} onOpen={onOpen} />)
    expect(ops.queried.find(q => q.op === 'listLocationFiles')?.args).toEqual({ target: loc, subPath: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'notes.md' }))
    expect(onOpen).toHaveBeenCalledWith('notes.md')
    ops.data.listLocationFiles = { entries: [{ name: 'q3.png', isDir: false }] }
    fireEvent.click(screen.getByRole('button', { name: 'charts' }))
    expect(ops.queried.at(-1)?.args).toEqual({ target: loc, subPath: 'charts' })
    fireEvent.click(screen.getByRole('button', { name: 'q3.png' }))
    expect(onOpen).toHaveBeenLastCalledWith('charts/q3.png')
  })
})

describe('the task\'s attachments @SC-1560', () => {
  it('open by name, and still download', () => {
    ops.data.getTaskAttachments = [{ id: 'att1', uuid: 'u1', fileName: 'q3.pdf', fileSizeBytes: 1200 }]
    const onOpen = vi.fn()
    render(<TaskAttachments taskId="t1" onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'q3.pdf' }))
    expect(onOpen).toHaveBeenCalledWith('att1')
    expect(screen.getByRole('button', { name: 'Download q3.pdf' })).toBeTruthy()
  })
})

describe('the task beside its file @SC-1559', () => {
  function measured(width: number) {
    vi.stubGlobal('ResizeObserver', class {
      constructor(private cb: ResizeObserverCallback) {}
      observe() { this.cb([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
      disconnect() {}
    })
  }
  const file = (layout: 'narrow' | 'wide') => <p>file {layout}</p>

  it('wide, shows the task and the file side by side', () => {
    measured(1200)
    render(<TaskBesideFile task={<p>the task</p>} file={file} />)
    expect(screen.getByText('the task')).toBeTruthy()
    expect(screen.getByText('file wide')).toBeTruthy()
  })

  it('narrow, the file covers the task', () => {
    measured(400)
    render(<TaskBesideFile task={<p>the task</p>} file={file} />)
    expect(screen.queryByText('the task')).toBeNull()
    expect(screen.getByText('file narrow')).toBeTruthy()
  })

  it('with no file open, the task alone', () => {
    measured(400)
    render(<TaskBesideFile task={<p>the task</p>} file={null} />)
    expect(screen.getByText('the task')).toBeTruthy()
  })
})
