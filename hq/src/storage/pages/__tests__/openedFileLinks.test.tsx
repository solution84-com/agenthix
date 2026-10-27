// @vitest-environment jsdom
/** A file's stable link, Mention's reference, and a link to a file that's gone (spec part 3, *Stable links*). */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { opened, readyAnswer, relayServing } from './filesToolsTestKit'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, Folder: icon, ChevronDown: icon, MoreHorizontal: icon }
})
vi.mock('wasp/client/operations', async () => (await import('./filesToolsTestKit')).opened)

import { OpenedFile, type OpenedFileProps } from '../OpenedFile'

const loc = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null, taskId: null }
const props = (over: Partial<OpenedFileProps> = {}): OpenedFileProps => ({
  file: { space: 'place', loc, path: 'reports/q3.md' }, kind: 'files', path: 'reports/q3.md',
  breadcrumb: ['Files', 'reports'], backLabel: 'Files', onBack: vi.fn(), layout: 'narrow',
  link: { tool: 'files', file: 'reports/q3.md' }, ...over,
})

let writeText: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  opened.openFile.mockResolvedValue(readyAnswer('q3.md', 'markdown', 4))
  relayServing('# Q3')
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => window.history.replaceState({}, '', '/'))

async function copyLink() {
  await screen.findByRole('link', { name: 'Download' })
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
  await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' })) })
}

describe('Copy link @SC-1537', () => {
  it('gives the place\'s address, without the conversation open on the page', async () => {
    window.history.replaceState({}, '', '/projects/AGX/t/c1')
    render(<OpenedFile {...props()} />)
    await copyLink()
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/projects/AGX?tool=files&file=reports%2Fq3.md`)
  })

  it('starts from the place it is given, where the file opened beside a conversation', async () => {
    window.history.replaceState({}, '', '/chat/t/c1')
    render(<OpenedFile {...props({ linkBase: '/projects/AGX', link: { tool: 'workspaces', workspace: 'w1', wfile: 'src/app.ts' } })} />)
    await copyLink()
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/projects/AGX?tool=workspaces&workspace=w1&wfile=src%2Fapp.ts`)
  })
})

describe('Mention @SC-1537', () => {
  it('names a workspace\'s file as the agent sees it, under its workspace', async () => {
    const taken: string[] = []
    const listener = (e: Event) => { e.preventDefault(); taken.push((e as CustomEvent<string>).detail) }
    window.addEventListener('agenthix:mention', listener)
    render(<OpenedFile {...props({ file: { space: 'place', loc: { ...loc, workspaceId: 'w1' }, path: 'src/app.ts' }, path: 'src/app.ts' })} />)
    await screen.findByRole('link', { name: 'Download' })
    fireEvent.click(screen.getByRole('button', { name: 'Mention' }))
    window.removeEventListener('agenthix:mention', listener)
    expect(taken).toEqual(['workspaces/w1/src/app.ts'])
  })
})

describe('a link to a file that is gone @SC-1538', () => {
  it('says so with the folder it was in, and opens that folder', async () => {
    opened.openFile.mockResolvedValue({ state: 'not-found' })
    const onOpenFolder = vi.fn()
    render(<OpenedFile {...props({ onOpenFolder })} />)
    expect(await screen.findByText("This file isn't here any more. It was in Files › reports.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open reports' }))
    expect(onOpenFolder).toHaveBeenCalled()
  })
})
