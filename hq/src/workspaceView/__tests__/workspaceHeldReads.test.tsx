// @vitest-environment jsdom
/**
 * A read the view makes again on a workspace event, that fails with its old answer still on screen: the content stays
 * and a meta line says it (a silent site at once), in place of saying nothing. Without an answer held, the failure
 * stays the nudge in place of the content.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { BranchLineView, WorkspaceBranchesView } from '../../branches/views'
import { featuresAnswer } from '../../test/featuresAnswer'

type State = { data?: unknown; error?: Error | null }
const states = vi.hoisted(() => ({ value: {} as Record<string, State> }))
vi.mock('../components/PhonePersonRows', () => ({ PhonePersonRows: () => null }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (name: string, _args: unknown, opts?: { enabled?: boolean }) => {
    if (opts?.enabled === false) return { data: undefined, error: null, dataUpdatedAt: 0, refetch: vi.fn() }
    const s = states.value[name] ?? {}
    return { data: s.data, error: s.error ?? null, dataUpdatedAt: Date.now(), refetch: vi.fn() }
  },
  useAction: () => vi.fn(),
  getBranchChanges: 'getBranchChanges', getMainVersionAt: 'getMainVersionAt', getMainVersionChanges: 'getMainVersionChanges', getBranchCommits: 'getBranchCommits', getMainVersions: 'getMainVersions',
  getGitTree: 'getGitTree', getGitFile: 'getGitFile', getTaskConversation: 'getTaskConversation', getAgents: 'getAgents',
  mergeBranch: 'mergeBranch', bringBranchUpToDate: 'bringBranchUpToDate', getWorkspaceRefusal: 'getWorkspaceRefusal', restoreVersion: 'restoreVersion', turnGitOn: 'turnGitOn',
  markConversationRead: vi.fn(), listLocationFiles: 'listLocationFiles',
  getPlaceWorkflows: 'getPlaceWorkflows', startWorkflowRun: 'startWorkflowRun', startTaskConversation: 'startTaskConversation',
  getLivePreviewPlaces: 'getLivePreviewPlaces', getLivePreview: 'getLivePreview', markLivePreviewInUse: 'markLivePreviewInUse',
  startLivePreview: 'startLivePreview', stopLivePreview: 'stopLivePreview', resumeLivePreview: 'resumeLivePreview',
  reloadLivePreview: 'reloadLivePreview', setLivePreviewAuto: 'setLivePreviewAuto', openLiveApp: 'openLiveApp',
  answerLivePreviewQuestion: 'answerLivePreviewQuestion', runLivePreviewWorkflow: 'runLivePreviewWorkflow', getFeatures: 'getFeatures',
}))
vi.mock('../../conversations/components/ConversationThread', () => ({ ConversationThread: () => <div>thread</div> }))
vi.mock('../../storage/pages/OpenedFile', () => ({ OpenedFile: () => <div>opened</div> }))
vi.mock('../../storage/pages/FolderTree', () => ({ FolderTree: () => <div>workspace folder</div> }))

import { FilesPanel } from '../components/FilesPanel'
import { DiffMiddle } from '../components/DiffMiddle'
import { VersionList, useMainVersions } from '../components/VersionMenu'
import { WorkspaceViewBody } from '../components/WorkspaceViewBody'

const silent = Object.assign(new Error('Execution Site "Laptop" is unreachable'), { statusCode: 503 })
const ref = { kind: 'branch' as const, branchId: 'b1' }
const tree = { exists: true, overflow: false, entries: [{ name: 'README.md', path: 'README.md', kind: 'file', bytes: 10 }] }
const file = { exists: true, binary: false, tooLarge: false, bytes: 6, text: 'one\ntwo\n' }
const change = { path: 'README.md', status: 'modified' as const, from: null, additions: 1, deletions: 0 }

beforeEach(() => { states.value = { getFeatures: { data: featuresAnswer() } } })
afterEach(cleanup)

describe('the file tree on a failed re-read @SC-1930', () => {
  const panel = () => render(<FilesPanel workspaceId="w1" gitRef={ref} changes={[]} onlyChanged={false} selected={null} onOpenFile={vi.fn()} />)

  it('says a silent site in a meta line over the tree it still shows', () => {
    states.value.getGitTree = { data: tree, error: silent }
    panel()
    expect(screen.getByText('README.md')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Laptop')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('says nothing while the re-read has not failed', () => {
    states.value.getGitTree = { data: tree }
    panel()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('still says it in place of the tree when none is held', () => {
    states.value.getGitTree = { error: silent }
    panel()
    expect(screen.queryByText('README.md')).toBeNull()
    expect(screen.getByText('The files could not be read')).toBeTruthy()
  })
})

describe('the opened change on a failed re-read', () => {
  it('keeps its lines and says a silent site over them', () => {
    states.value.getGitFile = { data: file, error: silent }
    render(<DiffMiddle workspaceId="w1" gitRef={ref} change={change} where="on this branch" layout="wide" onBack={vi.fn()} />)
    expect(screen.getByTestId('diff-read-nudge').textContent).toContain('Laptop')
    expect(screen.getByText('two')).toBeTruthy()
  })
})

describe('the versions on a failed re-read', () => {
  function Versions() {
    const list = useMainVersions('w1', 'h1')
    return <VersionList list={list} chosen={null} count={1} onChoose={vi.fn()} />
  }
  const held = { hasMore: false, versions: [{ number: 1, commit: 'c1', subject: 'First', author: { name: 'Rae' }, at: new Date().toISOString() }] }

  it('keeps the versions and says a silent site above them', () => {
    states.value.getMainVersions = { data: held, error: silent }
    render(<Versions />)
    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Laptop')
  })
})

describe('the branch changes on a failed re-read', () => {
  const login: BranchLineView = {
    id: 'b1', name: 'login-page', ahead: 3, behind: 0, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
    whose: { kind: 'conversation', conversationId: 'c1', title: 'Login page', personId: 'u1', personName: 'Rae' }, working: null,
  }
  const view: WorkspaceBranchesView = { git: true, canAct: true, main: { name: 'main', head: 'h1', versionCount: 1 }, branches: [login] }

  it('says a silent site over the middle, which stays as it was', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    states.value.getBranchChanges = { data: { base: 'h0', head: 'h2', overflow: false, baseVersion: 0, files: [change] }, error: silent }
    states.value.getGitTree = { data: tree }
    states.value.getGitFile = { data: file }
    states.value.getMainVersions = { data: { hasMore: false, versions: [] } }
    render(
      <MemoryRouter initialEntries={['/workspaces/w1/view?branch=login-page&file=README.md']}>
        <WorkspaceViewBody workspace={{ id: 'w1', name: 'site', ownerType: 'project', ownerId: 'p1' }} view={view} userId="u1"
          back={{ href: '/projects/WEB', label: 'Web' }} workspaces={[{ id: 'w1', name: 'site' }]} place={{ kind: 'project', key: 'SHOP' }} refetchBranches={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('changes-read-nudge').textContent).toContain('Laptop')
  })
})
