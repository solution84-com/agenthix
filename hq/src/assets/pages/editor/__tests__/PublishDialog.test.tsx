// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { EditorView } from '../editorTypes'
import type { EditorApi } from '../useEditorApi'
import type { FileChange } from '@agenthix/ui/files'

vi.mock('@agenthix/ui/files', () => ({ ChangesList: () => <div /> }))
vi.mock('../../../../library/components/WhichAgentsDialog', () => ({
  WhichAgentsDialog: ({ assetId, title }: { assetId: string; title: string }) => <div data-testid="which-agents" data-asset={assetId}>{title}</div>,
}))

import { PublishDialog } from '../PublishDialog'

const view = (inUse: string | null): EditorView => ({
  target: { kind: 'library', assetId: 'a1' }, name: 'release-notes', identity: 'my-org/release-notes', where: 'Library',
  revision: 1, files: [], base: [], baseLabel: '', inUse, draftBy: null, revisions: [], editsHere: true, notEditableReason: null,
  mayPublish: true, nextVersions: { patch: '1.0.1', minor: '1.1.0', major: '2.0.0' }, nextNumber: null,
  agentsWith: { everyAgent: false, names: [] }, warnings: [],
})

const changes = [{ path: 'SKILL.md', status: 'added', before: null, after: 'x' }] as unknown as FileChange[]

afterEach(cleanup)

describe('Publish (board U3b section 5) @SC-1625', () => {
  it('ends on Which agents use it? after the first publish, even once the view has the new version in use', async () => {
    const api = { publish: vi.fn().mockResolvedValue({ version: '1.0.0' }) } as unknown as EditorApi
    const props = { api, changes, onClose: vi.fn(), onPublished: vi.fn(), onReload: vi.fn() }
    const { rerender } = render(<MemoryRouter><PublishDialog view={view(null)} {...props} /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'First version' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish version 1.0.0' }))
    await screen.findByTestId('which-agents')
    rerender(<MemoryRouter><PublishDialog view={view('1.0.0')} {...props} /></MemoryRouter>)
    expect(screen.getByTestId('which-agents').textContent).toBe('release-notes 1.0.0 is published')
    expect(screen.getByTestId('which-agents').getAttribute('data-asset')).toBe('a1')
  })

  it('ends on Which agents use it? after a later publish too', async () => {
    const api = { publish: vi.fn().mockResolvedValue({ version: '1.1.0' }) } as unknown as EditorApi
    render(<MemoryRouter><PublishDialog view={view('1.0.0')} api={api} changes={changes} onClose={vi.fn()} onPublished={vi.fn()} onReload={vi.fn()} /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Second' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish version 1.1.0' }))
    expect((await screen.findByTestId('which-agents')).textContent).toBe('release-notes 1.1.0 is published')
  })

  it('does not ask a place’s skill which agents use it: it reaches the agents that work there', async () => {
    const api = { publish: vi.fn().mockResolvedValue({ version: '1' }) } as unknown as EditorApi
    const place: EditorView = { ...view('1'), target: { kind: 'place', placeSkillId: 'p1' }, nextVersions: null, nextNumber: 2 }
    render(<MemoryRouter><PublishDialog view={place} api={api} changes={changes} onClose={vi.fn()} onPublished={vi.fn()} onReload={vi.fn()} /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Second' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish version 2' }))
    await screen.findByText('release-notes is at version 1.')
    expect(screen.queryByTestId('which-agents')).toBeNull()
  })
})
