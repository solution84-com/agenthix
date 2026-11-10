// @vitest-environment jsdom
/**
 * A file of a workspace with Git is read as every other file is (review 2, N3): hq opens it at the commit in view, a
 * relay carries its bytes on a ticket, and the frame draws it by its kind with its header, ‹ back and Download. A
 * binary file at an older version is a picture in the frame, never a line outside it.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { opened, readyAnswer, relayServing, DOWNLOAD, PREVIEW } from '../../storage/pages/__tests__/filesToolsTestKit'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, Folder: icon, ChevronDown: icon, MoreHorizontal: icon }
})
vi.mock('wasp/client/operations', async () => (await import('../../storage/pages/__tests__/filesToolsTestKit')).opened)

import { GitFileMiddle } from '../components/GitFileMiddle'

const workspace = { id: 'w1', name: 'sales-report', ownerType: 'project' as const, ownerId: 'p1' }
const V1 = 'a'.repeat(40)
const TIP = 'b'.repeat(40)
const PNG = '\x89PNG\r\n\x1a\n'

beforeEach(() => {
  vi.clearAllMocks()
  relayServing(PNG)
})

function show(over: Partial<React.ComponentProps<typeof GitFileMiddle>> = {}) {
  const onBack = vi.fn()
  render(<GitFileMiddle workspace={workspace} branchName="main" path="images/revenue-by-month.png" commit={V1}
    layout="narrow" onBack={onBack} version={{ number: 1, named: 'v1' }} {...over} />)
  return onBack
}

describe('a Git workspace\'s file, through the relay @SC-1686', () => {
  it('opens a binary file at a version through hq, naming that commit, and draws it in the frame with Download and ‹ back', async () => {
    opened.openFile.mockResolvedValue(readyAnswer('revenue-by-month.png', 'image', PNG.length, 'image/png'))
    const onBack = show()
    const download = await screen.findByRole('link', { name: 'Download' })
    expect(download.getAttribute('href')).toBe(DOWNLOAD)
    expect(opened.openFile).toHaveBeenCalledWith({
      file: { space: 'place', loc: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1', taskId: null }, path: 'images/revenue-by-month.png', commit: V1 },
    })
    // The renderer draws once its bytes are known, after the header.
    expect((await screen.findByRole('img', { name: 'revenue-by-month.png' })).getAttribute('src')).toBe(PREVIEW)
    expect(screen.queryByText(/binary file/)).toBeNull()
    expect(screen.getByTestId('version-file').textContent).toBe('images/revenue-by-month.png as it was at v1 · read-only')
    fireEvent.click(screen.getByRole('button', { name: /images/ }))
    expect(onBack).toHaveBeenCalled()
  })

  it('opens it again when the commit in view moves, and waits while none is known', async () => {
    opened.openFile.mockResolvedValue(readyAnswer('notes.md', 'markdown', 4))
    const { rerender } = render(<GitFileMiddle workspace={workspace} branchName="main" path="notes.md" commit={null} layout="wide" onBack={vi.fn()} />)
    expect(opened.openFile).not.toHaveBeenCalled()
    rerender(<GitFileMiddle workspace={workspace} branchName="main" path="notes.md" commit={TIP} layout="wide" onBack={vi.fn()} />)
    await screen.findByRole('link', { name: 'Download' })
    rerender(<GitFileMiddle workspace={workspace} branchName="main" path="notes.md" commit={V1} layout="wide" onBack={vi.fn()} />)
    await vi.waitFor(() => expect(opened.openFile).toHaveBeenCalledTimes(2))
    expect(opened.openFile.mock.calls.map(c => (c[0] as { file: { commit: string } }).file.commit)).toEqual([TIP, V1])
  })

  it('names ‹ back for the folder, or the workspace for a file at the top', async () => {
    opened.openFile.mockResolvedValue({ state: 'not-found' })
    show({ path: 'notes.md' })
    await screen.findByTestId('file-not-there')
    expect(screen.getByRole('button', { name: /sales-report/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /main/ })).toBeNull()
  })

  it('says where it looked when the file isn\'t at that commit, in the frame with ‹ back', async () => {
    opened.openFile.mockResolvedValue({ state: 'not-found' })
    show()
    expect((await screen.findByTestId('file-not-there')).textContent).toContain("It isn't on main at v1.")
    expect(screen.getByRole('button', { name: /images/ })).toBeTruthy()
  })
})
