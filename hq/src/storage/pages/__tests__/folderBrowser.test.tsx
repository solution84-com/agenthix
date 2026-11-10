// @vitest-environment jsdom
/** The folders and the file open in them (D1, S4, S5, M3): the tree folds away, marks and reveals the open file. */
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Folder: icon, Search: icon, X: icon }
})
const folders = vi.hoisted(() => ({ byPath: {} as Record<string, { name: string; isDir?: boolean; size?: number; modifiedAt?: string }[]> }))
vi.mock('../filesToolData', () => ({
  useFolder: (_t: unknown, path: string) => ({ data: folders.byPath[path], isLoading: false, error: null }),
}))
const search = vi.hoisted(() => ({ files: [] as unknown[] }))
vi.mock('wasp/client/operations', () => ({
  findLocationFiles: 'findLocationFiles',
  useQuery: (_op: string, args: { fragment: string }) => ({ data: { files: search.files, truncated: false }, isLoading: false, error: null, args }),
}))

import { FolderTree, foldersTo, treeOrder } from '../FolderTree'
import { FolderBrowser, folderBackLabel } from '../FolderBrowser'

const target = { ownerType: 'project' as const, ownerId: 'p1' }

beforeEach(() => {
  cleanup()
  folders.byPath = {
    '': [{ name: 'report', isDir: true }, { name: 'b.md' }, { name: 'A.md' }, { name: 'data', isDir: true }],
    report: [{ name: 'q3.md' }],
    data: [{ name: 'orders.csv' }],
  }
  search.files = []
})

describe('the folder tree @SC-1877', () => {
  it('lists folders first, then files, each by name (M3)', () => {
    expect(treeOrder(folders.byPath['']).map(e => e.name)).toEqual(['data', 'report', 'A.md', 'b.md'])
  })

  it('opens the folders on the way to the open file and marks it with the selected fill (S4)', () => {
    expect(foldersTo('report/2026/q3.md')).toEqual(['report', 'report/2026'])
    render(<FolderTree target={target} selected="report/q3.md" onOpenFile={vi.fn()} />)
    const row = screen.getByRole('button', { name: 'q3.md' })
    expect(row.getAttribute('aria-current')).toBe('true')
    expect(row.className).toContain('bg-selected')
    expect(screen.getByRole('button', { name: 'report' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'data' }).getAttribute('aria-expanded')).toBe('false')
  })
})

function browser(file: string | null, over: Partial<React.ComponentProps<typeof FolderBrowser>> = {}) {
  const onOpenFile = vi.fn()
  const onClose = vi.fn()
  render(
    <FolderBrowser
      target={target} top="Files" wide file={file} onOpenFile={onOpenFile} onClose={onClose}
      opened={({ back, folderToggle }) => (
        <div>
          <button type="button" onClick={back.onBack}>‹ {back.label}</button>
          {folderToggle && <button type="button" onClick={folderToggle.onToggle}>{folderToggle.shown ? 'Hide the folder' : 'Show the folder'}</button>}
        </div>
      )}
      narrowList={() => <p>the list</p>}
      {...over}
    />,
  )
  return { onOpenFile, onClose }
}

describe('opening a file folds the folders away (D1) @SC-1877', () => {
  it('beside the folders while nothing is open', () => {
    browser(null)
    expect(screen.getByTestId('folder-beside')).toBeTruthy()
    expect(screen.getByText('Select a file to read it.')).toBeTruthy()
  })

  it('a file open takes the whole tool, with ‹ <folder> back and ▤ to bring the folder beside it', () => {
    const { onClose } = browser('report/q3.md')
    expect(screen.queryByTestId('folder-beside')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show the folder' }))
    expect(screen.getByTestId('folder-beside')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '‹ report' }))
    expect(onClose).toHaveBeenCalled()
    expect(folderBackLabel('q3.md', 'Files')).toBe('Files')
  })

  it('a file the place opened on by itself (a README) keeps the folder beside it', () => {
    browser('README.md', { chosen: false })
    expect(screen.getByTestId('folder-beside')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show the folder' })).toBeNull()
  })
})

describe('Search files (S5) @SC-1878', () => {
  it('finds a file in any folder, with its folder, and opens it', () => {
    search.files = [{ path: 'images/revenue-by-month.png', name: 'revenue-by-month.png', folder: 'images', size: 10, modifiedAt: '2026-11-10T07:39:00Z' }]
    const { onOpenFile } = browser(null)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search files' }), { target: { value: 'revenue' } })
    expect(screen.getByText(/^images · Image/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /revenue-by-month\.png/ }))
    expect(onOpenFile).toHaveBeenCalledWith('images/revenue-by-month.png')
  })

  it('says no file matches, never that the folder is empty', () => {
    browser(null)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search files' }), { target: { value: 'revenue' } })
    expect(screen.getByText('No files match “revenue”.')).toBeTruthy()
  })
})
