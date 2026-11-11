// @vitest-environment jsdom
/** A renewal that failed leaves the file on screen and says so in a line; while the frame line says HQ is not answering, the line is held back. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ReadNudgesHeld } from '@agenthix/ui/attention'

const ready = { state: 'ready', facts: { name: 'q3.md', size: 4, version: 'v1', contentType: 'text/markdown', kind: 'markdown' }, previewLink: 'p', downloadLink: 'd', expiresAt: 1 }
vi.mock('../../../files/useOpenFile', () => ({
  useOpenFile: () => ({ answer: ready, error: new Error('HQ did not answer'), reopen: vi.fn() }),
  useOpenAnswer: () => ({ answer: undefined, error: undefined, reopen: vi.fn() }),
}))
vi.mock('@agenthix/ui/files', async () => ({ ...(await vi.importActual<object>('@agenthix/ui/files')), FileFrame: () => <div>the file</div> }))

import { OpenedFile } from '../OpenedFile'

const loc = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null, taskId: null }
const show = (held: boolean) => render(
  <ReadNudgesHeld.Provider value={held}>
    <OpenedFile file={{ space: 'place', loc, path: 'q3.md' }} kind="files" path="q3.md" breadcrumb={['Files']} back={{ label: 'Files', onBack: vi.fn() }} link={{ tool: 'files', file: 'q3.md' }} />
  </ReadNudgesHeld.Provider>,
)

afterEach(cleanup)

describe('OpenedFile, a renewal that failed @SC-1929', () => {
  it('says the file could not be opened again, beside the file', () => {
    show(false)
    expect(screen.getByText('the file')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('could not be opened again')
  })

  it('says nothing of its own while the frame line says HQ is not answering', () => {
    show(true)
    expect(screen.getByText('the file')).toBeTruthy()
    expect(screen.queryByText(/could not be opened again/)).toBeNull()
  })
})
