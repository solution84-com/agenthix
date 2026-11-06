// @vitest-environment jsdom
/** Add: the ways in without New skill, and an installed skill ends on Which agents use it?. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('wasp/client/operations', () => ({
  getAssetShelf: { name: 'getAssetShelf' },
  restoreLibraryAsset: { name: 'restoreLibraryAsset' },
  useAction: () => async () => ({}),
  useQuery: () => ({ data: { can: { shelf: true, outside: true }, items: [{ name: 'pdf-reading', title: 'pdf-reading', identity: 'agenthix/pdf-reading', version: '1.0.0', description: 'Read PDFs.', suitedTo: [], have: null }], suitedTo: [], removed: [] } }),
}))
vi.mock('../../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('../../../../library/components/WhichAgentsDialog', () => ({
  WhichAgentsDialog: ({ assetId, title }: { assetId: string; title: string }) => <div data-testid="which-agents" data-asset={assetId}>{title}</div>,
}))
const installed: { result: object; preview: object } = { result: {}, preview: {} }
vi.mock('../InstallDialog', () => ({
  InstallDialog: ({ onInstalled }: { onInstalled: (r: never, p: never) => void }) => (
    <button type="button" onClick={() => onInstalled(installed.result as never, installed.preview as never)}>finish</button>
  ),
}))

import { AddPage } from '../AddPage'

afterEach(cleanup)

const open = (at: string) => render(<MemoryRouter initialEntries={[at]}><AddPage /></MemoryRouter>)
const finish = (kind: string, outcome: string) => {
  installed.result = { assetId: 'a1', outcome }
  installed.preview = { kind, title: 'pdf-reading', version: '1.0.0' }
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  fireEvent.click(screen.getByRole('button', { name: 'finish' }))
}

describe('Add ends on agents @SC-1609', () => {
  it('lists the three ways in and no New skill', () => {
    open('/library/add')
    expect(screen.getByTestId('add-shelf')).toBeTruthy()
    expect(screen.getByTestId('add-upload')).toBeTruthy()
    expect(screen.getByTestId('add-link')).toBeTruthy()
    expect(screen.queryByText('New skill')).toBeNull()
  })

  it('asks which agents use a skill that was installed new', () => {
    open('/library/add?from=shelf')
    expect(screen.queryByText(/Nothing here reaches an agent/)).toBeNull()
    finish('skill', 'new')
    const step = screen.getByTestId('which-agents')
    expect(step.textContent).toBe('pdf-reading 1.0.0 is installed')
    expect(step.getAttribute('data-asset')).toBe('a1')
  })

  it('does not ask for an update, which stays at the version in use, or for a template', () => {
    open('/library/add?from=shelf')
    finish('skill', 'update')
    expect(screen.queryByTestId('which-agents')).toBeNull()
    cleanup()
    open('/library/add?from=shelf')
    finish('board', 'new')
    expect(screen.queryByTestId('which-agents')).toBeNull()
    expect(screen.getByTestId('installed-notice').textContent).toContain('Open it')
  })
})
