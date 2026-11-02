// @vitest-environment jsdom
/** The Files tools on screen (every screen reviewed spec §3): Files, Artefacts and Workspaces. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  address, setAddress, data, ok, failed, siteDown, NOW_ISO, opened, readyAnswer, relayServing,
} from './filesToolsTestKit'

// Where ui has its own copy of lucide-react, the icons ui renders here are stubbed by that path, so no second React
// renders. Where ui shares hq's copy, as on CI and in the image, the path is hq's, and every other icon stays real.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, FileText: icon, Loader2: icon, Folder: icon, Search: icon, ChevronDown: icon, MoreHorizontal: icon, Plus: icon }
})

vi.mock('react-router', async () => {
  const react = await import('react')
  const { address } = await import('./filesToolsTestKit')
  return {
    useSearchParams: () => {
      const [, tick] = react.useReducer((n: number) => n + 1, 0)
      react.useEffect(() => { address.listeners.add(tick); return () => { address.listeners.delete(tick) } }, [])
      const set = (change: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => {
        address.params = typeof change === 'function' ? change(address.params) : change
        address.listeners.forEach(l => l())
      }
      return [address.params, set]
    },
    Navigate: ({ to }: { to: string }) => react.createElement('div', null, `navigated to ${to}`),
  }
})
vi.mock('../filesToolData', async () => (await import('./filesToolsTestKit')).data)
vi.mock('wasp/client/operations', async () => (await import('./filesToolsTestKit')).opened)
vi.mock('../BackupLine', () => ({ BackupLine: () => <div data-testid="backup" />, repoName: (u: string) => u.replace('https://github.com/', '') }))
vi.mock('../GitLine', () => ({ GitLine: ({ target }: { target: { ownerId: string; workspaceId?: string } }) => <div data-testid="git">git line {target.ownerId}{target.workspaceId ?? ''}</div> }))
vi.mock('../WorkspaceView', () => ({ WorkspaceView: ({ workspaceId, connecting }: { workspaceId: string; connecting: boolean }) => <div>workspace {workspaceId}{connecting ? ' connecting' : ''}</div> }))
vi.mock('../NewWorkspaceForm', () => ({ NewWorkspaceForm: () => <div>new workspace form</div> }))
vi.mock('../../../shared/components/NoExecutionSiteNotice', () => ({ NoExecutionSiteNotice: () => null, useNoExecutionSite: () => false }))

import { FilesTool } from '../FilesTool'
import { ArtefactsTool } from '../ArtefactsTool'
import { WorkspacesTool } from '../WorkspacesTool'

const owner = { ownerType: 'project' as const, ownerId: 'p1' }
const loc = { ...owner, workspaceId: null, taskId: null }
const ROADMAP = '# Roadmap\n\n- Pricing page'

beforeEach(() => {
  vi.clearAllMocks()
  setAddress('tool=files')
  data.useFolder.mockReturnValue(ok([]))
  data.useArtefacts.mockReturnValue(ok([]))
  opened.openFile.mockResolvedValue(readyAnswer('ROADMAP.md', 'markdown', ROADMAP.length))
  relayServing(ROADMAP)
  data.useWorkspaces.mockReturnValue({ workspaces: [], unanswered: [], isLoading: false })
})

const rowNames = () => screen.getAllByRole('button').map(b => b.textContent ?? '').filter(t => /\.md|specs|brand/.test(t))

describe('the Files tool', () => {
  const files = [
    { name: 'PROJECT.md', size: 1024, modifiedAt: NOW_ISO(5) },
    { name: 'ROADMAP.md', size: 2048, modifiedAt: NOW_ISO(0) },
    { name: 'specs', isDir: true, modifiedAt: NOW_ISO(3) },
    { name: '.agents', isDir: true, modifiedAt: NOW_ISO(1) },
  ]

  it('lists the documents newest first with kind and size, and never the agents’ own folder', () => {
    data.useFolder.mockReturnValue(ok(files))
    render(<FilesTool owner={owner} />)
    expect(rowNames().map(t => t.split(/Markdown|Folder/)[0].replace(/\d\d:\d\d$/, ''))).toEqual(['ROADMAP.md', 'specs', 'PROJECT.md'])
    expect(screen.getByText('Markdown · 2 KB')).toBeTruthy()
    expect(screen.getByText('Folder')).toBeTruthy()
    expect(screen.queryByText('.agents')).toBeNull()
  })

  it('shows the git status line for files/, then the GitHub backup line, and searches by name', () => {
    data.useFolder.mockReturnValue(ok(files))
    render(<FilesTool owner={owner} />)
    expect(screen.getByTestId('git').textContent).toBe(`git line ${owner.ownerId}`)
    expect(screen.getByTestId('git').compareDocumentPosition(screen.getByTestId('backup')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search files'), { target: { value: 'road' } })
    expect(rowNames()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Search files'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No files match/)).toBeTruthy()
  })

  it('offers no upload and no “Start session here”', () => {
    data.useFolder.mockReturnValue(ok(files))
    render(<FilesTool owner={owner} />)
    expect(screen.queryByText(/upload/i)).toBeNull()
    expect(screen.queryByText(/start session here/i)).toBeNull()
  })

  it('says the site could not be asked, not that there are no files', () => {
    data.useFolder.mockReturnValue(failed(siteDown))
    render(<FilesTool owner={owner} />)
    expect(screen.getByRole('status').textContent).toContain("isn't answering")
    expect(screen.getByRole('status').textContent).toContain('Laptop')
    expect(screen.queryByText(/No files yet/)).toBeNull()
  })

  it('says another failure failed, rather than calling the folder empty', () => {
    data.useFolder.mockReturnValue(failed(Object.assign(new Error('Path not allowed'), { statusCode: 400 })))
    render(<FilesTool owner={owner} />)
    expect(screen.getByRole('status').textContent).toContain('Path not allowed')
    expect(screen.queryByText(/No files yet/)).toBeNull()
  })

  it('still says there are no files for a folder the site answered for with nothing in it', () => {
    render(<FilesTool owner={owner} />)
    expect(screen.getByText(/No files yet/)).toBeTruthy()
  })

  it('opens a folder in place, with a way back', () => {
    data.useFolder.mockReturnValue(ok(files))
    render(<FilesTool owner={owner} />)
    fireEvent.click(screen.getByText('specs'))
    expect(address.params.get('dir')).toBe('specs')
    expect(screen.getByText('‹ specs')).toBeTruthy()
    fireEvent.click(screen.getByText('‹ specs'))
    expect(address.params.get('dir')).toBeNull()
  })

  it('opens a file inside the tool through HQ\'s open action, drawn by the frame, with Mention and ⋯ — and goes back to the list @SC-1533', async () => {
    data.useFolder.mockReturnValue(ok(files))
    render(<FilesTool owner={owner} />)
    fireEvent.click(screen.getByText('ROADMAP.md'))
    expect(address.params.get('file')).toBe('ROADMAP.md')
    expect(await screen.findByRole('heading', { name: 'Roadmap' })).toBeTruthy()
    expect(opened.openFile).toHaveBeenCalledTimes(1)
    expect(opened.openFile).toHaveBeenCalledWith({ file: { space: 'place', loc, path: 'ROADMAP.md' } })
    expect(screen.getByText(/Markdown · \d+ B/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mention' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'More actions' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Files/ }))
    expect(address.params.get('file')).toBeNull()
  })

})

describe('the Files tool, wide', () => {
  afterEach(() => vi.unstubAllGlobals())

  function widen(width: number) {
    vi.stubGlobal('ResizeObserver', class {
      constructor(private cb: (entries: { contentRect: { width: number } }[]) => void) {}
      observe() { this.cb([{ contentRect: { width } }]) }
      disconnect() {}
    })
  }

  it('puts the folders beside the open file instead of replacing the list, with where it lives above its title @SC-1533', async () => {
    widen(900)
    setAddress('tool=files&file=ROADMAP.md')
    data.useFolder.mockReturnValue(ok([{ name: 'ROADMAP.md', size: 2048, modifiedAt: NOW_ISO(0) }, { name: 'specs', isDir: true, modifiedAt: NOW_ISO(3) }]))
    render(<FilesTool owner={owner} />)
    expect(screen.getByRole('button', { name: 'specs' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Roadmap' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mention' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toBe('Files › ROADMAP.md')
  })

  it('asks for a file when none is open', () => {
    widen(900)
    data.useFolder.mockReturnValue(ok([{ name: 'ROADMAP.md', modifiedAt: NOW_ISO(0) }]))
    render(<FilesTool owner={owner} />)
    expect(screen.getByText('Select a file to read it.')).toBeTruthy()
  })
})

describe('the Artefacts tool', () => {
  const artefacts = [
    { name: 'Old story.md', size: 11 * 1024, modifiedAt: NOW_ISO(20) },
    { name: 'Hero options.png', size: 1_258_291, modifiedAt: NOW_ISO(0, 9) },
    { name: 'Pricing options.pdf', size: 220 * 1024, modifiedAt: NOW_ISO(2) },
  ]

  it('says what artefacts are and how to keep one', () => {
    render(<ArtefactsTool owner={owner} />)
    expect(screen.getByText(/Keep one by asking an agent to move it into Files/)).toBeTruthy()
  })

  it('groups newest first under Today, This week and Older with kind and size', () => {
    data.useArtefacts.mockReturnValue(ok(artefacts))
    render(<ArtefactsTool owner={owner} />)
    const groups = screen.getAllByRole('region').map(g => [g.getAttribute('aria-label'), g.textContent])
    expect(groups.map(g => g[0])).toEqual(['Today', 'This week', 'Older'])
    expect(groups[0][1]).toContain('Hero options.png')
    expect(groups[0][1]).toContain('Image · 1.2 MB')
    expect(groups[1][1]).toContain('PDF · 220 KB')
    expect(groups[2][1]).toContain('Old story.md')
  })

  it('opens one in the same frame, through the open action, and a link’s address opens it directly', async () => {
    data.useArtefacts.mockReturnValue(ok(artefacts))
    opened.openFile.mockResolvedValue(readyAnswer('Pricing options.pdf', 'pdf', 220 * 1024, 'application/pdf'))
    const { unmount } = render(<ArtefactsTool owner={owner} />)
    fireEvent.click(screen.getByText('Pricing options.pdf'))
    expect(address.params.get('artefact')).toBe('Pricing options.pdf')
    expect(opened.openFile).toHaveBeenCalledWith({ file: { space: 'artefact', owner, name: 'Pricing options.pdf' } })
    expect(await screen.findByTitle('Pricing options.pdf')).toBeTruthy()
    unmount()
    setAddress('tool=artefacts&artefact=Hero%20options.png')
    render(<ArtefactsTool owner={owner} />)
    expect(screen.getByRole('button', { name: /Artefacts/ })).toBeTruthy()
  })

  it('says nothing is known when the list cannot be read yet, never "No artefacts yet"', () => {
    data.useArtefacts.mockReturnValue(failed(new Error('This list is not available yet.')))
    render(<ArtefactsTool owner={owner} />)
    expect(screen.getByRole('status').textContent).toContain('not available yet')
    expect(screen.queryByText(/No artefacts yet/)).toBeNull()
  })
})

describe('the Workspaces tool @SC-1025', () => {
  const workspaces = [{ id: 'w1', name: 'web', repoUrl: 'https://github.com/acme/web' }, { id: 'w2', name: 'docs-site', repoUrl: null }]

  it('has no back link on its own list, which is the Workspaces tab itself', () => {
    setAddress('tool=workspaces')
    render(<WorkspacesTool owner={owner} siteLabel="Office Mac" />)
    expect(screen.getByText('Workspaces')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Workspaces|Tools|Back/ })).toBeNull()
  })

  it('shows one card per workspace with its repository and site, and Connect GitHub where there is none', () => {
    data.useWorkspaces.mockReturnValue({ workspaces, unanswered: [], isLoading: false })
    render(<WorkspacesTool owner={owner} siteLabel="Office Mac" />)
    expect(screen.getByText('acme/web')).toBeTruthy()
    expect(screen.getByText('No repository')).toBeTruthy()
    expect(screen.getAllByText('Office Mac')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Connect GitHub' })).toHaveLength(1)
    expect(screen.queryByText(/branch|last push|created by/i)).toBeNull()
  })

  it('opens a workspace from anywhere on its tile, not only its name', () => {
    data.useWorkspaces.mockReturnValue({ workspaces, unanswered: [], isLoading: false })
    render(<WorkspacesTool owner={owner} siteLabel="Office Mac" />)
    fireEvent.click(screen.getByText('acme/web'))
    expect(address.params.get('workspace')).toBe('w1')
  })

  it('opens a workspace full screen, in the workspace view at its own address', () => {
    data.useWorkspaces.mockReturnValue({ workspaces, unanswered: [], isLoading: false })
    render(<WorkspacesTool owner={owner} siteLabel="Office Mac" />)
    fireEvent.click(screen.getByText('acme/web'))
    expect(screen.getByText('navigated to /workspaces/w1/view')).toBeTruthy()
  })

  it('opens a workspace, and Connect GitHub opens it ready to connect', () => {
    data.useWorkspaces.mockReturnValue({ workspaces, unanswered: [], isLoading: false })
    render(<WorkspacesTool owner={owner} siteLabel="Office Mac" />)
    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }))
    expect(address.params.get('workspace')).toBe('w2')
    expect(address.params.get('connect')).toBe('1')
    expect(screen.getByText('workspace w2 connecting')).toBeTruthy()
  })

  it('has ＋ New in the header, which opens the form in place', () => {
    render(<WorkspacesTool owner={owner} siteLabel="Office Mac" />)
    fireEvent.click(screen.getByRole('button', { name: /New/ }))
    expect(screen.getByText('new workspace form')).toBeTruthy()
  })

  it('names the sites that did not answer in one quiet line, instead of a large warning', () => {
    data.useWorkspaces.mockReturnValue({
      workspaces,
      unanswered: [{ siteId: 's2', label: 'Office Mac', reason: 'offline', detail: 'asleep' }],
      isLoading: false,
    })
    render(<WorkspacesTool owner={owner} siteLabel="Office Mac" />)
    const line = screen.getByRole('status')
    expect(line.textContent).toContain("1 site isn't answering, so its workspaces aren't shown.")
    fireEvent.click(screen.getByRole('button', { name: 'Which' }))
    expect(line.textContent).toContain('Office Mac')
    expect(screen.queryByText(/could not be asked/)).toBeNull()
  })

  it('does not say there are none while a site is silent', () => {
    data.useWorkspaces.mockReturnValue({
      workspaces: [],
      unanswered: [{ siteId: 's2', label: 'Office Mac', reason: 'offline', detail: 'asleep' }],
      isLoading: false,
    })
    render(<WorkspacesTool owner={owner} siteLabel={null} />)
    expect(screen.queryByText(/No workspaces yet/)).toBeNull()
  })
})
