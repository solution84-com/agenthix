// @vitest-environment jsdom
/** A task's files open in the file viewer over the task (the file viewer's rule 1): attachments, working files, their link, a path a run's result names. */
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
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, Folder: icon, ChevronLeft: icon, MoreHorizontal: icon, Download: icon, Maximize2: icon, PanelLeft: icon, X: icon, Paperclip: icon }
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
  listLocationFiles: 'listLocationFiles', getFileFacts: 'getFileFacts', getProjects: 'getProjects',
  useQuery: (op: string, args: unknown, opts?: { enabled?: boolean }) => {
    if (opts?.enabled === false) return { data: undefined, isLoading: false, error: null }
    ops.queried.push({ op, args })
    return { data: ops.data[`${op}:${JSON.stringify(args)}`] ?? ops.data[op], isLoading: false, error: ops.data[`${op}:error`] ?? null }
  },
  useAction: () => vi.fn(),
  openFile: ops.openFile, openFiles: ops.openFiles, openTaskAttachment: ops.openTaskAttachment,
}))
vi.mock('../../../shared/utils/agentImageUrl', () => ({ fileLink: vi.fn() }))

import { MemoryRouter } from 'react-router'
import { ViewerFile } from '../../../storage/pages/viewer/ViewerFile'
import type { ViewerTarget } from '../../../storage/pages/viewer/viewerAddress'
import { TaskWorkingFiles, useWorkingFileCount } from '../TaskWorkingFiles'
import { TaskResultMarkdown } from '../TaskResultMarkdown'
import { taskEmbed } from '../taskEmbed'
import { createEmbedBatch } from '../../../shared/components/markdownEmbed/embedBatch'
import { ChipFactsContext } from '../../../shared/components/markdownEmbed/useChipFacts'
import type { FileFactsAnswer } from '../../../files/fileFactsAnswer'
import { ReadNudgesHeld } from '@agenthix/ui/attention'

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

const from = { kind: 'task', taskKey: 'WEB-42' } as const
const attachment = (id: string): ViewerTarget => ({ kind: 'attachment', taskId: 't1', taskKey: 'WEB-42', id, from })
const working = (path: string): ViewerTarget => ({ kind: 'file', ref: { space: 'place', loc, path }, placePath: '/projects/WEB', taskKey: 'WEB-42', from })

function opened(target: ViewerTarget) {
  const props = { target, back: { label: 'WEB-42', onBack: vi.fn() }, onOpen: vi.fn() }
  render(<MemoryRouter><ViewerFile {...props} /></MemoryRouter>)
  return props
}

describe('an attachment opened in the file viewer @SC-1559 @SC-1869 @SC-1935', () => {
  it('opens through HQ\'s attachment action and draws in the frame, with Download on the relay', async () => {
    ops.data.getTaskAttachments = [{ id: 'att1', uuid: 'u1', fileName: 'q3.md', fileSizeBytes: 20 }]
    ops.openTaskAttachment.mockResolvedValue(ready('q3.md', 'markdown', 20))
    relayServing('# Q3 report\n\nGrew 6%.')
    opened(attachment('att1'))
    expect(await screen.findByRole('heading', { name: 'Q3 report' })).toBeTruthy()
    expect(ops.openTaskAttachment).toHaveBeenCalledWith({ attachmentId: 'att1' })
    expect(ops.openFile).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Download' }).getAttribute('href')).toBe(DOWNLOAD)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toBe('WEB-42 › Attachments')
  })

  it('one ‹ back, named for the task, returns to it; no ✕ overlapping ⋯ (S15, S21, M6) @SC-1879', async () => {
    ops.openTaskAttachment.mockResolvedValue(ready('q3.md', 'markdown', 2))
    relayServing('hi')
    const props = opened(attachment('att1'))
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'WEB-42' }))
    expect(props.back.onBack).toHaveBeenCalled()
  })

  it('has Mention and Copy path, naming it as the agent does (M10) @SC-1871', async () => {
    ops.data.getTaskAttachments = [{ id: 'att1', uuid: 'u1', fileName: 'q3.md', fileSizeBytes: 20 }]
    ops.openTaskAttachment.mockResolvedValue(ready('q3.md', 'markdown', 2))
    relayServing('hi')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    opened(attachment('att1'))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Mention' })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' })) })
    expect(writeText).toHaveBeenCalledWith('attachments/WEB-42/q3.md')
  })
})

describe('a working file opened in the file viewer @SC-1559 @SC-1869', () => {
  it('opens through the open action in the task\'s own folder', async () => {
    ops.openFile.mockResolvedValue(ready('notes.md', 'markdown', 9))
    relayServing('# Notes\n')
    opened(working('drafts/notes.md'))
    expect(await screen.findByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(ops.openFile).toHaveBeenCalledWith({ file: { space: 'place', loc, path: 'drafts/notes.md' } })
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toBe('WEB-42 › Working files › drafts')
  })

  it('says a path that names nothing is not there, never that it was deleted (S18) @SC-1874', async () => {
    ops.openFile.mockResolvedValue({ state: 'not-found' })
    opened(working('report/q3-sales-report.md'))
    expect(await screen.findByText("There's no file at report/q3-sales-report.md in WEB-42's working files.")).toBeTruthy()
    expect(screen.queryByText(/isn't here any more/)).toBeNull()
  })

  it('offers the place\'s own file of the same path when there is one (S18) @SC-1874', async () => {
    ops.openFile.mockResolvedValue({ state: 'not-found' })
    ops.data.getFileFacts = { answers: [{ state: 'ready', facts: { name: 'q3.md', size: 1, version: '1:1', contentType: 'text/markdown', kind: 'markdown' } }] }
    const props = opened(working('report/q3.md'))
    fireEvent.click(await screen.findByRole('button', { name: 'Open Files › report › q3.md' }))
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ ref: { space: 'place', loc: { ...loc, taskId: null }, path: 'report/q3.md' } }))
  })

  it('Copy link copies the task link form, never a ticket @SC-1561', async () => {
    ops.openFile.mockResolvedValue(ready('notes.md', 'markdown', 9))
    relayServing('# Notes\n')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    opened(working('drafts/notes.md'))
    await screen.findByRole('heading', { name: 'Notes' })
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' })) })
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/projects/WEB?task=WEB-42&file=drafts%2Fnotes.md`)
  })
})

describe('the task\'s working files @SC-1560', () => {
  it('say where a task\'s files come from when the folder is empty', () => {
    ops.data.listLocationFiles = { entries: [] }
    const { container } = render(<TaskWorkingFiles loc={loc} onOpen={vi.fn()} />)
    expect(container.textContent).toBe("The files this task's runs write in its own folder show here.")
  })

  it('count what the top of the folder holds for the Files tab, leaving hidden files out', () => {
    function Count() { return <p>{String(useWorkingFileCount(loc))}</p> }
    ops.data.listLocationFiles = { entries: [{ name: 'pages', isDir: true }, { name: '.cache', isDir: true }, { name: 'notes.md', isDir: false }] }
    render(<Count />)
    expect(screen.getByText('2')).toBeTruthy()
    cleanup()
    function NoFolder() { return <p>{String(useWorkingFileCount(null))}</p> }
    render(<NoFolder />)
    expect(screen.getByText('undefined')).toBeTruthy()
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

  it('say a failed read in place with Try again, and are held back while the frame says HQ is not answering', () => {
    ops.data['listLocationFiles:error'] = new Error('down')
    const { container, unmount } = render(<TaskWorkingFiles loc={loc} onOpen={vi.fn()} />)
    expect(screen.getByText('The working files could not be read')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    unmount()
    const held = render(<ReadNudgesHeld.Provider value><TaskWorkingFiles loc={loc} onOpen={vi.fn()} /></ReadNudgesHeld.Provider>)
    expect(held.container.textContent).not.toContain('could not be')
    expect(container).toBeTruthy()
  })

  it('offer no Try again on a final answer', () => {
    ops.data['listLocationFiles:error'] = Object.assign(new Error('There is no such folder.'), { statusCode: 404 })
    render(<TaskWorkingFiles loc={loc} onOpen={vi.fn()} />)
    expect(screen.getByText('There is no such folder.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})

describe('a path a run\'s result names @SC-1560', () => {
  function result(content: string) {
    const onOpen = vi.fn()
    const facts = createEmbedBatch<FileFactsAnswer>(async files => files.map(() => ({ state: 'gone' as const })), 0)
    const embed = taskEmbed('p1', 't1', { key: 'WEB-42', openers: { onOpen } })
    render(
      <ChipFactsContext.Provider value={facts}>
        <TaskResultMarkdown content={content} embed={embed} loc={loc} />
      </ChipFactsContext.Provider>,
    )
    return onOpen
  }

  it('opens the file it names in the task\'s folder, read from the listing of the folder it is in', () => {
    ops.data[`listLocationFiles:${JSON.stringify({ target: loc, subPath: 'pages' })}`] = { entries: [{ name: 'work.md', isDir: false }] }
    const onOpen = result('I drafted the Work page. The page is in pages/work.md.')
    expect(ops.queried.filter(q => q.op === 'listLocationFiles').map(q => q.args)).toContainEqual({ target: loc, subPath: 'pages' })
    fireEvent.click(screen.getByRole('button', { name: /pages\/work\.md/ }))
    expect(onOpen).toHaveBeenCalledWith({ space: 'place', loc, path: 'pages/work.md' })
  })

  it('leaves a path the folder does not have as text', () => {
    ops.data.listLocationFiles = { entries: [{ name: 'home.md', isDir: false }] }
    result('The page is in pages/work.md.')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('The page is in pages/work.md.')).toBeTruthy()
  })
})
