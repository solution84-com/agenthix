// @vitest-environment jsdom
/** The GitHub backup line of Files, and the old addresses that open the place with the right tool (spec §3). */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery,
  useAction: vi.fn(() => vi.fn()),
  getRepoState: 'getRepoState', getWorkspace: 'getWorkspace', getProject: 'getProject',
}))
vi.mock('react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
  useParams: () => params.value,
}))
vi.mock('../RepoPanel', () => ({ RepoPanel: () => <div>repo panel</div> }))
const params = vi.hoisted(() => ({ value: {} as Record<string, string> }))

import { BackupLine } from '../BackupLine'
import { ProjectFilesPage } from '../ProjectFilesPage'
import { ProjectWorkspacesPage } from '../ProjectWorkspacesPage'
import { WorkspaceDetailPage } from '../WorkspaceDetailPage'
import { FilesPage } from '../FilesPage'

const owner = { ownerType: 'project' as const, ownerId: 'p1' }
const to = () => screen.getByTestId('navigate').textContent

beforeEach(() => vi.clearAllMocks())

describe('the GitHub backup line', () => {
  it('names the repository it is backed up to', () => {
    useQuery.mockReturnValue({ data: { repoUrl: 'https://github.com/acme/agenthix-docs' }, error: null })
    render(<BackupLine owner={owner} />)
    expect(screen.getByText('acme/agenthix-docs')).toBeTruthy()
    expect(screen.queryByText('repo panel')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Manage' }))
    expect(screen.getByText('repo panel')).toBeTruthy()
  })

  it('offers “Back up to GitHub” when there is no repository, opening the connect flow', () => {
    useQuery.mockReturnValue({ data: { repoUrl: null }, error: null })
    render(<BackupLine owner={owner} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back up to GitHub' }))
    expect(screen.getByText('repo panel')).toBeTruthy()
  })

  it('shows the repository but no Manage or Back up button to someone who may not administer the project', () => {
    useQuery.mockReturnValue({ data: { repoUrl: 'https://github.com/acme/agenthix-docs', mayAdminister: false }, error: null })
    const { unmount } = render(<BackupLine owner={owner} />)
    expect(screen.getByText('acme/agenthix-docs')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Manage' })).toBeNull()
    unmount()
    useQuery.mockReturnValue({ data: { repoUrl: null, mayAdminister: false }, error: null })
    render(<BackupLine owner={owner} />)
    expect(screen.getByText('Not backed up')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back up to GitHub' })).toBeNull()
  })

  it('offers both to a project administrator', () => {
    useQuery.mockReturnValue({ data: { repoUrl: null, mayAdminister: true }, error: null })
    render(<BackupLine owner={owner} />)
    expect(screen.getByRole('button', { name: 'Back up to GitHub' })).toBeTruthy()
  })

  it('offers nothing while the state cannot be read: a repository may already be attached', () => {
    useQuery.mockReturnValue({ data: undefined, error: new Error('The Execution Site did not answer') })
    render(<BackupLine owner={owner} />)
    expect(screen.getByRole('status').textContent).toContain('could not be read')
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('the old addresses @SC-659', () => {
  it('a project’s Files and Workspaces tabs open the project with the tool', () => {
    params.value = { key: 'AGX' }
    const { unmount } = render(<ProjectFilesPage />)
    expect(to()).toBe('/projects/AGX?tool=files')
    unmount()
    render(<ProjectWorkspacesPage />)
    expect(to()).toBe('/projects/AGX?tool=workspaces')
  })

  it('a workspace’s own address opens it full screen, in the workspace view', () => {
    params.value = { workspaceId: 'w1' }
    render(<WorkspaceDetailPage />)
    expect(to()).toBe('/workspaces/w1/view')
  })

  it('an owner’s Files address opens the project’s, or the person’s own space', () => {
    params.value = { ownerType: 'user', ownerId: 'u1' }
    useQuery.mockReturnValue({ data: undefined, error: null })
    const { unmount } = render(<FilesPage />)
    expect(to()).toBe('/chat?tool=files')
    unmount()
    params.value = { ownerType: 'project', ownerId: 'p1' }
    useQuery.mockReturnValue({ data: { key: 'AGX' }, error: null })
    render(<FilesPage />)
    expect(to()).toBe('/projects/AGX?tool=files')
  })
})
