// @vitest-environment jsdom
/** A workspace opened, and a new one made, inside the Workspaces tool (every screen reviewed spec §3). */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// Where ui has its own copy of lucide-react, the icons ui renders here are stubbed by that path, so no second React
// renders. Where ui shares hq's copy, as on CI and in the image, the path is hq's, and every other icon stays real.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), File: icon, FileImage: icon, Folder: icon, Search: icon, ChevronDown: icon, MoreHorizontal: icon, Plus: icon }
})

const useQuery = vi.hoisted(() => vi.fn())
const actions = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>))
vi.mock('wasp/client/operations', () => ({
  useQuery,
  useAction: (name: string) => (actions[name] ??= vi.fn()),
  getWorkspace: 'getWorkspace', getRepoState: 'getRepoState', deleteWorkspace: 'deleteWorkspace', disconnectRepo: 'disconnectRepo',
  createWorkspace: 'createWorkspace', connectRepo: 'connectRepo', setWorkspaceAllowedTools: 'setWorkspaceAllowedTools',
  getWorkspaceRemoval: 'getWorkspaceRemoval',
}))
vi.mock('react-router', () => ({ useSearchParams: () => [new URLSearchParams(), vi.fn()] }))
vi.mock('../../../github/connect/ConnectRepoFlow', () => ({ ConnectRepoFlow: ({ target, defaultName, onCancel }: { target: { workspaceId: string }; defaultName: string; onCancel: () => void }) => <div>connect flow {target.workspaceId} {defaultName}<button type="button" onClick={onCancel}>Cancel</button></div> }))
vi.mock('../RepoPanel', () => ({ RepoPanel: () => <div>repo panel</div> }))
vi.mock('../GitLine', () => ({ GitLine: ({ target }: { target: { workspaceId?: string } }) => <div>git line {target.workspaceId}</div> }))
vi.mock('../FolderTree', () => ({ FolderTree: () => <div>folder tree</div> }))
vi.mock('../OperationsPanel', () => ({ OperationsPanel: () => <div>secrets</div> }))
vi.mock('../OpenedFile', () => ({
  OpenedFile: ({ path, file, link }: { path: string; file: { space: string; loc: { workspaceId: string } }; link: Record<string, string> }) =>
    <div>file opened {path} in {file.space} {file.loc.workspaceId}, linked as {link.workspace}/{link.wfile}</div>,
}))
const topFolder = vi.hoisted(() => ({ entries: [] as { name: string; isDir: boolean }[] }))
vi.mock('../filesToolData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../filesToolData')>()),
  useFolder: () => ({ data: topFolder.entries, isLoading: false, error: null }),
}))
vi.mock('../../../shared/components/NoExecutionSiteNotice', () => ({ NoExecutionSiteNotice: () => null, useNoExecutionSite: () => false }))

import { WorkspaceView } from '../WorkspaceView'
import { WorkspaceAbout } from '../WorkspaceAbout'
import { NewWorkspaceForm } from '../NewWorkspaceForm'

const ws = { id: 'w1', name: 'web', ownerType: 'project', ownerId: 'p1', ownerName: 'Agenthix', ownerKey: 'AGX', repoUrl: 'https://github.com/acme/web', allowedTools: null }

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(actions)) delete actions[k]
  useQuery.mockReturnValue({ data: ws, error: null })
  topFolder.entries = []
})

describe('a workspace opened', () => {
  it('opens as its file explorer: a box saying what it is, then its files — nothing hq does not know', () => {
    render(<WorkspaceView workspaceId="w1" siteLabel="Office Mac" connecting={false} onBack={vi.fn()} />)
    expect(screen.getByText('acme/web')).toBeTruthy()
    expect(screen.getByText('Office Mac')).toBeTruthy()
    expect(screen.getByText('folder tree')).toBeTruthy()
    // The workspace's git status sits above its files.
    expect(screen.getByText('git line w1').compareDocumentPosition(screen.getByText('folder tree')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'About' })).toBeTruthy()
    // Runs, facts and secrets are in About, not on the explorer.
    expect(screen.queryByText('runs')).toBeNull()
    expect(screen.queryByText(/branch|last pushed|created by/i)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open preview' })).toBeNull()
  })

  it('keeps Delete under ⋯, asking first', async () => {
    const onBack = vi.fn()
    actions.deleteWorkspace = vi.fn().mockResolvedValue(undefined)
    render(<WorkspaceView workspaceId="w1" siteLabel={null} connecting={false} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete workspace' }))
    expect(actions.deleteWorkspace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete — any files not yet pushed to GitHub go with it; the repository is not affected/ }))
    await waitFor(() => expect(actions.deleteWorkspace).toHaveBeenCalledWith({ workspaceId: 'w1' }))
    await waitFor(() => expect(onBack).toHaveBeenCalled())
  })

  it('names what the delete loses once the site has said what it holds', () => {
    useQuery.mockImplementation((op: unknown) => ({ data: op === 'getRepoState' ? { repoUrl: ws.repoUrl, isGitRepo: true, hasFiles: true } : ws, error: null }))
    render(<WorkspaceView workspaceId="w1" siteLabel={null} connecting={false} onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete workspace' }))
    expect(screen.getByRole('menuitem', { name: 'Delete — files not yet pushed to GitHub go with it; the repository is not affected' })).toBeTruthy()
  })

  it('says No repository with Connect GitHub, and shows the connect flow only once connecting starts @SC-1321', () => {
    useQuery.mockReturnValue({ data: { ...ws, repoUrl: null }, error: null })
    const { unmount } = render(<WorkspaceView workspaceId="w1" siteLabel={null} connecting={false} onBack={vi.fn()} />)
    expect(screen.getByText('No repository')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Connect GitHub' })).toBeTruthy()
    expect(screen.queryByText('repo panel')).toBeNull()
    unmount()
    render(<WorkspaceView workspaceId="w1" siteLabel={null} connecting onBack={vi.fn()} />)
    expect(screen.getByText('repo panel')).toBeTruthy()
  })

  it('opens on its README when the explorer is wide enough to show it beside the folders', () => {
    topFolder.entries = [{ name: 'src', isDir: true }, { name: 'README.md', isDir: false }]
    const observers: Array<(e: { contentRect: { width: number } }[]) => void> = []
    vi.stubGlobal('ResizeObserver', class { constructor(cb: never) { observers.push(cb) } observe() {} disconnect() {} })
    render(<WorkspaceView workspaceId="w1" siteLabel={null} connecting={false} onBack={vi.fn()} />)
    act(() => observers.forEach(cb => cb([{ contentRect: { width: 900 } }])))
    expect(screen.getByText('file opened README.md in place w1, linked as w1/README.md')).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('says why it cannot be shown when its site does not answer, rather than waiting forever', () => {
    useQuery.mockReturnValue({ data: undefined, error: new Error('Execution Site "Laptop" is unreachable') })
    render(<WorkspaceView workspaceId="w1" siteLabel={null} connecting={false} onBack={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toContain('unreachable')
    expect(screen.queryByText('Loading…')).toBeNull()
  })
})

describe('a workspace\'s About', () => {
  const about = () => render(
    <WorkspaceAbout ws={ws} target={{ ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }} siteLabel="Office Mac" onDisconnect={vi.fn()} onBack={vi.fn()} />,
  )

  it('holds the facts and the GitHub section @SC-1321', () => {
    about()
    expect(screen.getByText('acme/web')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
    expect(screen.getByText('Office Mac', { selector: 'dd' })).toBeTruthy()
    expect(screen.getByText(/^All/)).toBeTruthy()
    expect(screen.getByText('secrets')).toBeTruthy()
  })

  it('changes the tools agents may use in place', () => {
    about()
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByText('Restrict tools for sessions working in this workspace')).toBeTruthy()
  })
})

describe('a new workspace', () => {
  it('names the site instead of asking for one, and needs a name', () => {
    render(<NewWorkspaceForm owner={{ ownerType: 'project', ownerId: 'p1' }} siteLabel="Office Mac" onBack={vi.fn()} onCreated={vi.fn()} />)
    expect(screen.getByText('Office Mac')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect((screen.getByRole('button', { name: /Create/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('creates an empty workspace and opens it', async () => {
    actions.createWorkspace = vi.fn().mockResolvedValue({ workspaceId: 'w9' })
    const onCreated = vi.fn()
    render(<NewWorkspaceForm owner={{ ownerType: 'project', ownerId: 'p1' }} siteLabel="Office Mac" onBack={vi.fn()} onCreated={onCreated} />)
    fireEvent.change(screen.getByPlaceholderText('docs-site'), { target: { value: 'docs' } })
    fireEvent.click(screen.getByRole('button', { name: /Create/ }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('w9'))
    expect(actions.createWorkspace).toHaveBeenCalledWith({ name: 'docs', ownerType: 'project', ownerId: 'p1' })
  })

  it('from a GitHub repository creates the workspace, then goes on to the connect flow @SC-1321', async () => {
    actions.createWorkspace = vi.fn().mockResolvedValue({ workspaceId: 'w9' })
    const onCreated = vi.fn()
    render(<NewWorkspaceForm owner={{ ownerType: 'project', ownerId: 'p1' }} siteLabel={null} onBack={vi.fn()} onCreated={onCreated} />)
    fireEvent.change(screen.getByPlaceholderText('docs-site'), { target: { value: 'docs' } })
    fireEvent.click(screen.getByLabelText(/A GitHub repository/))
    fireEvent.click(screen.getByRole('button', { name: /Create and connect a repository/ }))
    await waitFor(() => expect(screen.getByText('connect flow w9 docs')).toBeTruthy())
    expect(onCreated).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCreated).toHaveBeenCalledWith('w9')
  })
})
