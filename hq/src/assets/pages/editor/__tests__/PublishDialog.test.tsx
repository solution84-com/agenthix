// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { EditorView } from '../editorTypes'
import type { EditorApi } from '../useEditorApi'
import type { FileChange } from '@agenthix/ui/files'

vi.mock('@agenthix/ui/files', () => ({ ChangesList: () => <div /> }))

import { PublishDialog } from '../PublishDialog'

const view = (inUse: string | null): EditorView => ({
  target: { kind: 'library', assetId: 'a1' }, name: 'release-notes', identity: 'my-org/release-notes', where: 'Library',
  revision: 1, files: [], base: [], baseLabel: '', inUse, draftBy: null, revisions: [], editsHere: true, notEditableReason: null,
  mayPublish: true, nextVersions: { patch: '1.0.1', minor: '1.1.0', major: '2.0.0' }, nextNumber: null,
  agentsWith: { everyAgent: false, names: [] }, warnings: [],
})

const changes = [{ path: 'SKILL.md', status: 'added', before: null, after: 'x' }] as unknown as FileChange[]

afterEach(cleanup)

describe('Publish (board U3b section 5)', () => {
  it('offers Add to agents after the first publish, even once the view has the new version in use', async () => {
    const api = { publish: vi.fn().mockResolvedValue({ version: '1.0.0' }) } as unknown as EditorApi
    const props = { api, changes, onClose: vi.fn(), onPublished: vi.fn(), onReload: vi.fn() }
    const { rerender } = render(<MemoryRouter><PublishDialog view={view(null)} {...props} /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'First version' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish version 1.0.0' }))
    await screen.findByText('release-notes is at version 1.0.0.')
    rerender(<MemoryRouter><PublishDialog view={view('1.0.0')} {...props} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Add to agents…' }).getAttribute('href')).toBe('/library/a1')
  })

  it('offers no Add to agents after a later publish', async () => {
    const api = { publish: vi.fn().mockResolvedValue({ version: '1.1.0' }) } as unknown as EditorApi
    render(<MemoryRouter><PublishDialog view={view('1.0.0')} api={api} changes={changes} onClose={vi.fn()} onPublished={vi.fn()} onReload={vi.fn()} /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Second' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish version 1.1.0' }))
    await screen.findByText('release-notes is at version 1.1.0.')
    expect(screen.queryByRole('link', { name: 'Add to agents…' })).toBeNull()
  })
})
