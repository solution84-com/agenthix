// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const data: Record<string, unknown> = {}
vi.mock('wasp/client/operations', () => ({
  getTaskAttachments: 'getTaskAttachments', uploadTaskAttachment: 'uploadTaskAttachment', getFilesPlace: 'getFilesPlace',
  useQuery: (op: string) => ({ data: data[op] }),
  useAction: () => vi.fn(),
}))
vi.mock('../../../shared/utils/agentImageUrl', () => ({ fileLink: vi.fn() }))

import { TaskAttachments, FILES_OPEN_ON_YOUR_COMPUTER } from '../TaskAttachments'

const files = [{ id: 'a1', uuid: 'u1', fileName: 'jaw-v3.png', label: null, fileSizeBytes: 240_000 }]

beforeEach(() => {
  cleanup()
  for (const k of Object.keys(data)) delete data[k]
})

describe('a task\'s files when HQ shows uploads as downloads only @SC-637', () => {
  it('says once why every file is a download', () => {
    data.getTaskAttachments = files
    data.getFilesPlace = { downloadsOnly: true }
    render(<TaskAttachments taskId="t1" />)
    expect(screen.getByText(FILES_OPEN_ON_YOUR_COMPUTER)).toBeTruthy()
    expect(FILES_OPEN_ON_YOUR_COMPUTER).toBe('Files open on your computer, not here — this HQ shows uploads as downloads only.')
    expect(screen.getByRole('button', { name: 'Download jaw-v3.png' })).toBeTruthy()
  })

  it('says nothing when HQ has a place of its own for them', () => {
    data.getTaskAttachments = files
    data.getFilesPlace = { downloadsOnly: false }
    render(<TaskAttachments taskId="t1" />)
    expect(screen.queryByText(FILES_OPEN_ON_YOUR_COMPUTER)).toBeNull()
  })

  it('says nothing about files when there are none', () => {
    data.getTaskAttachments = []
    data.getFilesPlace = { downloadsOnly: true }
    render(<TaskAttachments taskId="t1" />)
    expect(screen.queryByText(FILES_OPEN_ON_YOUR_COMPUTER)).toBeNull()
  })
})
