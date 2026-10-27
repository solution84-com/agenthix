// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

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
    render(<TaskAttachments taskId="t1" />)
    expect(screen.getByText(PDFS_DOWNLOAD_ONLY)).toBeTruthy()
    expect(PDFS_DOWNLOAD_ONLY).toBe('PDFs download rather than open here: this HQ has no files address to preview them.')
    expect(screen.getByRole('button', { name: 'Download quote.PDF' })).toBeTruthy()
  })

  it('says nothing when no attachment is a PDF: the rest open beside the task through HQ\'s own address', () => {
    data.getTaskAttachments = files
    data.getFilesPlace = { downloadsOnly: true }
    render(<TaskAttachments taskId="t1" />)
    expect(screen.queryByText(PDFS_DOWNLOAD_ONLY)).toBeNull()
    expect(screen.queryByText(/download/i)).toBeNull()
  })

  it('says nothing when HQ has a files address', () => {
    data.getTaskAttachments = [...files, pdf]
    data.getFilesPlace = { downloadsOnly: false }
    render(<TaskAttachments taskId="t1" />)
    expect(screen.queryByText(PDFS_DOWNLOAD_ONLY)).toBeNull()
  })

  it('says nothing about files when there are none', () => {
    data.getTaskAttachments = []
    data.getFilesPlace = { downloadsOnly: true }
    render(<TaskAttachments taskId="t1" />)
    expect(screen.queryByText(PDFS_DOWNLOAD_ONLY)).toBeNull()
  })
})

describe('attaching a file @SC-1531', () => {
  it('says the limit and sends nothing when the file is over 10 MB', () => {
    data.getTaskAttachments = []
    const { container } = render(<TaskAttachments taskId="t1" />)
    const big = new File(['x'], 'scan.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 12 * 1024 * 1024 })
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [big] } })
    expect(screen.getByRole('alert').textContent).toBe('scan.png is 12.0 MB. Attachments can be up to 10 MB.')
    expect(upload).not.toHaveBeenCalled()
  })
})
