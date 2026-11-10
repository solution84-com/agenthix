// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// ui resolves its own copy of lucide-react where it has one; the icons a Files row draws are stubbed by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, Folder: icon }
})

const data: Record<string, unknown> = {}
const upload = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  getTaskAttachments: 'getTaskAttachments', uploadTaskAttachment: 'uploadTaskAttachment', getFilesPlace: 'getFilesPlace',
  useQuery: (op: string) => ({ data: data[op] }),
  useAction: () => upload,
}))
vi.mock('../../../shared/utils/agentImageUrl', () => ({ fileLink: vi.fn() }))

import { TaskAttachments, PDFS_DOWNLOAD_ONLY } from '../TaskAttachments'

const files = [{ id: 'a1', uuid: 'u1', fileName: 'jaw-v3.png', label: null, fileSizeBytes: 240_000 }]
const pdf = { id: 'a2', uuid: 'u2', fileName: 'quote.PDF', label: null, fileSizeBytes: 90_000 }

beforeEach(() => {
  cleanup()
  for (const k of Object.keys(data)) delete data[k]
  upload.mockReset()
})

describe('a task\'s files when HQ has no files address @SC-637', () => {
  it('says once that a PDF downloads, since only a PDF needs a files address to preview', () => {
    data.getTaskAttachments = [...files, pdf]
    data.getFilesPlace = { downloadsOnly: true }
    render(<TaskAttachments taskId="t1" onOpen={() => {}} />)
    expect(screen.getByText(PDFS_DOWNLOAD_ONLY)).toBeTruthy()
    expect(PDFS_DOWNLOAD_ONLY).toBe('PDFs download rather than open here: this HQ has no files address to preview them.')
  })

  it('says nothing when no attachment is a PDF: the rest open beside the task through HQ\'s own address', () => {
    data.getTaskAttachments = files
    data.getFilesPlace = { downloadsOnly: true }
    render(<TaskAttachments taskId="t1" onOpen={() => {}} />)
    expect(screen.queryByText(PDFS_DOWNLOAD_ONLY)).toBeNull()
  })

  it('says nothing when HQ has a files address', () => {
    data.getTaskAttachments = [...files, pdf]
    data.getFilesPlace = { downloadsOnly: false }
    render(<TaskAttachments taskId="t1" onOpen={() => {}} />)
    expect(screen.queryByText(PDFS_DOWNLOAD_ONLY)).toBeNull()
  })

  it('says nothing about files when there are none', () => {
    data.getTaskAttachments = []
    data.getFilesPlace = { downloadsOnly: true }
    render(<TaskAttachments taskId="t1" onOpen={() => {}} />)
    expect(screen.queryByText(PDFS_DOWNLOAD_ONLY)).toBeNull()
  })
})

describe('a task\'s attachments as their own section (S14) @SC-1879', () => {
  it('draws each as a Files row with its kind and size, opening it in the viewer, the open one marked', () => {
    data.getTaskAttachments = [...files, pdf]
    const onOpen = vi.fn()
    render(<TaskAttachments taskId="t1" selected="a2" onOpen={onOpen} />)
    expect(screen.getByRole('region', { name: 'Attachments' })).toBeTruthy()
    expect(screen.getByText(/^Image · 234/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /jaw-v3\.png/ }))
    expect(onOpen).toHaveBeenCalledWith('a1')
    expect(screen.getByRole('button', { name: /quote\.PDF/ }).getAttribute('aria-current')).toBe('true')
  })

  it('says so when there are none, with Attach file beside the words', () => {
    data.getTaskAttachments = []
    render(<TaskAttachments taskId="t1" onOpen={() => {}} />)
    expect(screen.getByText('No files attached yet.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Attach file' })).toBeTruthy()
  })
})

describe('attaching a file @SC-1531', () => {
  it('says the limit and sends nothing when the file is over 10 MB', () => {
    data.getTaskAttachments = []
    const { container } = render(<TaskAttachments taskId="t1" onOpen={() => {}} />)
    const big = new File(['x'], 'scan.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 12 * 1024 * 1024 })
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [big] } })
    expect(screen.getByRole('alert').textContent).toBe('scan.png is 12.0 MB. Attachments can be up to 10 MB.')
    expect(upload).not.toHaveBeenCalled()
  })
})
