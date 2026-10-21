// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { asAdmin, layoutFake, useQueryFake } from './harness'

const { build } = vi.hoisted(() => ({ build: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (op: string, args?: unknown) => useQueryFake(op, args),
  getUserSettings: 'getUserSettings',
  getFleetAccess: 'getFleetAccess',
  buildSupportBundle: (...a: unknown[]) => build(...a),
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: layoutFake }))

import { BundlePage } from '../BundlePage'

const made = {
  fileName: 'agenthix-support-2026-10-10.zip', createdAt: new Date(), covers: 'HQ and 2 sites', logsSince: new Date(), sizeBytes: 2_000_000, zipBase64: btoa('zip'),
  files: [{ path: 'README.txt', text: 'what this is' }, { path: 'logs/hq.log', text: 'a line' }],
}

beforeEach(() => { cleanup(); build.mockReset(); asAdmin() })

describe('Support bundle @SC-730', () => {
  it('says what goes in and what never does', () => {
    render(<MemoryRouter><BundlePage /></MemoryRouter>)
    expect(screen.getByText('Settings that are set')).toBeTruthy()
    expect(screen.getByText('Never in it')).toBeTruthy()
    expect(screen.getByText(/No keys, tokens, passwords or model logins/)).toBeTruthy()
  })

  it('shows every file before anything is downloaded', async () => {
    build.mockResolvedValue(made)
    render(<MemoryRouter><BundlePage /></MemoryRouter>)
    fireEvent.click(screen.getByText('See what is in it'))
    await waitFor(() => expect(screen.getByText('README.txt')).toBeTruthy())
    expect(screen.getByText('logs/hq.log')).toBeTruthy()
    expect(screen.getByText('what this is')).toBeTruthy()
    expect(screen.getByText(/About 2 MB · HQ and 2 sites/)).toBeTruthy()
    expect(build).toHaveBeenCalledWith({ logs: '24h', levels: 'all' })
  })

  it('downloads the zip it built', async () => {
    build.mockResolvedValue(made)
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    render(<MemoryRouter><BundlePage /></MemoryRouter>)
    fireEvent.click(screen.getByText('Download'))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob
    expect(blob.type).toBe('application/zip')
  })
})
