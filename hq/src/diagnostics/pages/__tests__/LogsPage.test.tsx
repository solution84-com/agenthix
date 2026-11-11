// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { answers, asAdmin, calls, layoutFake, useQueryFake } from './harness'

const { more, download } = vi.hoisted(() => ({ more: vi.fn(), download: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string, args?: unknown) => useQueryFake(op, args),
  getUserSettings: 'getUserSettings',
  getFleetAccess: 'getFleetAccess',
  getLogSources: 'getLogSources',
  getLogs: Object.assign((...a: unknown[]) => more(...a), { toString: () => 'getLogs' }),
  downloadLogs: (...a: unknown[]) => download(...a),
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: layoutFake }))

import { LogsPage } from '../LogsPage'

const line = (over: object) => ({ at: '2026-10-10T11:04:10.000Z', level: 'error', source: 'agents.dispatch', message: 'run a81e09bb failed', ...over })
const sources = [
  { source: 'hq', label: 'HQ', kind: 'hq', connected: true, notice: null },
  { source: 'e2', label: 'Design laptop', kind: 'site', connected: false, notice: 'Design laptop is not connected, so its logs cannot be read now. They are kept on its own machine.' },
]
const show = () => render(<MemoryRouter><LogsPage /></MemoryRouter>)

beforeEach(() => {
  cleanup(); calls.length = 0; more.mockReset(); download.mockReset()
  asAdmin()
  answers.current.getLogSources = sources
})


describe('Logs @SC-728', () => {
  it('starts at errors and warnings for HQ and lists each line with its source and message', () => {
    answers.current.getLogs = { source: sources[0], lines: [line({}), line({ level: 'warn', message: 'slow' })], nextCursor: null }
    show()
    expect(screen.getByText('run a81e09bb failed')).toBeTruthy()
    expect(screen.getByText('Warn')).toBeTruthy()
    const query = calls.find(c => typeof c.args === 'object' && c.args && 'levels' in (c.args as object))
    expect(query?.args).toMatchObject({ source: 'hq', levels: 'problems' })
  })

  it('opens a line in full with Open the run and Copy this line @SC-729', () => {
    answers.current.getLogs = { source: sources[0], lines: [line({ fields: { runId: 'r9', sessionId: 's9' } })], nextCursor: null }
    show()
    expect(screen.queryByText('Copy this line')).toBeNull()
    fireEvent.click(screen.getByText('run a81e09bb failed'))
    expect(screen.getByText('Open the run').getAttribute('href')).toBe('/runs/r9?session=s9')
    expect(screen.getByText('Copy this line')).toBeTruthy()
  })

  it('offers no Open the run for a line that names a run without its session @SC-729', () => {
    answers.current.getLogs = { source: sources[0], lines: [line({ fields: { runId: 'r9' } })], nextCursor: null }
    show()
    fireEvent.click(screen.getByText('run a81e09bb failed'))
    expect(screen.queryByText('Open the run')).toBeNull()
    expect(screen.getByText('Copy this line')).toBeTruthy()
  })

  it('says why a source has no lines on its piece: greyed, the reason in its tooltip, a press opens the dialog', () => {
    answers.current.getLogs = { source: sources[0], lines: [line({})], nextCursor: null }
    show()
    const laptop = screen.getByRole('radio', { name: 'Design laptop' })
    expect(laptop.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(laptop)
    expect(screen.getByTestId('attention-text').textContent).toContain('kept on its own machine')
    expect(screen.getByRole('radio', { name: 'HQ' }).getAttribute('aria-checked')).toBe('true')
  })

  it('pages back with Older lines ›', async () => {
    answers.current.getLogs = { source: sources[0], lines: [line({})], nextCursor: 'c1' }
    more.mockResolvedValue({ source: sources[0], lines: [line({ message: 'older one', at: '2026-10-09T10:00:00.000Z' })], nextCursor: null })
    show()
    fireEvent.click(screen.getByText('Older lines ›'))
    await waitFor(() => expect(screen.getByText('older one')).toBeTruthy())
    expect(more.mock.calls[0][0]).toMatchObject({ source: 'hq', cursor: 'c1' })
    expect(screen.queryByText('Older lines ›')).toBeNull()
  })

  it('downloads the chosen source and range @SC-729', async () => {
    answers.current.getLogs = { source: sources[0], lines: [line({})], nextCursor: null }
    download.mockResolvedValue({ fileName: 'hq.log', text: 'x', lines: 1, truncated: false, notice: null })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    show()
    fireEvent.click(screen.getByText('Download'))
    await waitFor(() => expect(download).toHaveBeenCalled())
    expect(download.mock.calls[0][0]).toMatchObject({ source: 'hq', levels: 'problems' })
  })
})
