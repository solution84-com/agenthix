// @vitest-environment jsdom
/**
 * What the owner's walk found in the workspace view: Deploy… lists no live-preview workflow, the strip's dot means a
 * live preview runs, a closed branch leaves nothing behind in the address or the notice, and the view starts no
 * conversation or task of its own.
 */
import { withFeature } from '@agenthix/core/testing'
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import type { BranchLineView, WorkspaceBranchesView } from '../../branches/views'
import { DockContext, type DockValue } from '../../dock/DockContext'

const answers = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const actions = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>))
// The person's foot and its phone rows have their own tests (viewFoot.test.tsx).
vi.mock('../components/PhonePersonRows', () => ({ PhonePersonRows: () => null }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (name: string, args: unknown, opts?: { enabled?: boolean }) => {
    if (opts?.enabled === false) return { data: undefined, error: null, refetch: vi.fn() }
    const a = answers.value[name]
    return { data: typeof a === 'function' ? (a as (x: unknown) => unknown)(args) : a, error: null, refetch: vi.fn() }
  },
  useAction: (name: string) => (actions[name] ??= vi.fn()),
  getBranchChanges: 'getBranchChanges', getMainVersionAt: 'getMainVersionAt', getMainVersionChanges: 'getMainVersionChanges', getBranchCommits: 'getBranchCommits', getMainVersions: 'getMainVersions',
  getGitTree: 'getGitTree', getGitFile: 'getGitFile', getTaskConversation: 'getTaskConversation', getAgents: 'getAgents',
  getProject: 'getProject', createTask: 'createTask', runTask: 'runTask',
  mergeBranch: 'mergeBranch', bringBranchUpToDate: 'bringBranchUpToDate', getWorkspaceRefusal: 'getWorkspaceRefusal', restoreVersion: 'restoreVersion', turnGitOn: 'turnGitOn',
  markConversationRead: vi.fn(), listLocationFiles: 'listLocationFiles',
  getPlaceWorkflows: 'getPlaceWorkflows', startWorkflowRun: 'startWorkflowRun', startTaskConversation: 'startTaskConversation',
  getLivePreviewPlaces: 'getLivePreviewPlaces', getLivePreview: 'getLivePreview', markLivePreviewInUse: 'markLivePreviewInUse',
  startLivePreview: 'startLivePreview', stopLivePreview: 'stopLivePreview', resumeLivePreview: 'resumeLivePreview',
  reloadLivePreview: 'reloadLivePreview', setLivePreviewAuto: 'setLivePreviewAuto', openLiveApp: 'openLiveApp',
  answerLivePreviewQuestion: 'answerLivePreviewQuestion', runLivePreviewWorkflow: 'runLivePreviewWorkflow',
  getFeatures: 'getFeatures',
}))
vi.mock('../../conversations/components/ConversationThread', () => ({
  ConversationThread: ({ conversationId }: { conversationId: string }) => <div>thread {conversationId}</div>,
}))
vi.mock('../../storage/pages/OpenedFile', () => ({ OpenedFile: ({ path }: { path: string }) => <div>opened {path}</div> }))
vi.mock('../../storage/pages/FolderTree', () => ({ FolderTree: () => <div>workspace folder</div> }))

import { WorkspaceViewBody } from '../components/WorkspaceViewBody'
import { LeftStrip } from '../components/LeftPanel'
import { DeployList } from '../components/DeployList'
import { featuresAnswer } from '../../test/featuresAnswer'

const workspace = { id: 'w1', name: 'shop-app', ownerType: 'project' as const, ownerId: 'p1' }
const footer: BranchLineView = {
  id: 'b1', name: 'footer-wording', ahead: 1, behind: 0, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'conversation', conversationId: 'c1', title: 'Footer wording', personId: 'u1', personName: 'Mia' }, working: null,
}
const view = (branches: BranchLineView[], versionCount = 5): WorkspaceBranchesView => ({
  git: true, canAct: true, main: { name: 'main', head: `h${versionCount}`, versionCount }, branches,
})

function Where() {
  return <div data-testid="where">{useLocation().search}</div>
}

function tree(v: WorkspaceBranchesView, dock: DockValue | null) {
  return (
    <DockContext.Provider value={dock}>
      <WorkspaceViewBody workspace={workspace} view={v} userId="u1" back={{ href: '/projects/SHOP?tool=workspaces', label: 'Fernhill Shop' }}
        workspaces={[{ id: 'w1', name: 'shop-app' }]} place={{ kind: "project", key: "SHOP" }} refetchBranches={vi.fn()} />
      <Where />
    </DockContext.Provider>
  )
}

function show(v: WorkspaceBranchesView, at = '/workspaces/w1/view', dock: DockValue | null = null) {
  const r = render(<MemoryRouter initialEntries={[at]}>{tree(v, dock)}</MemoryRouter>)
  return { rerender: (next: WorkspaceBranchesView) => r.rerender(<MemoryRouter initialEntries={[at]}>{tree(next, dock)}</MemoryRouter>) }
}

const where = () => screen.getByTestId('where').textContent ?? ''
const workflow = (name: string) => ({
  id: name, name, description: `${name} does it`, enabled: true, approved: { definition: { parameters: [] } },
})

beforeEach(() => {
  localStorage.clear()
  for (const k of Object.keys(actions)) delete actions[k]
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
  answers.value = {
    getFeatures: featuresAnswer,
    getBranchChanges: { base: 'h4', head: 'h9', overflow: false, baseVersion: 5, files: [] },
    getMainVersions: { hasMore: false, versions: [] },
    getGitTree: { exists: true, overflow: false, entries: [] },
    getTaskConversation: { conversation: { id: 'tc1' }, lead: null, canStart: false, refusal: null },
    getAgents: [{ id: 'a1', name: 'Kernel', handle: 'kernel' }],
    getProject: { agents: [{ agent: { id: 'a1' } }] },
    getPlaceWorkflows: { workflows: [], mayRun: true, mayAdminister: false },
  }
})

const deploy = () => render(<MemoryRouter><DeployList place={{ type: 'project', id: 'p1' }} workspaceId="w1" /></MemoryRouter>)

describe('Deploy… on main', () => {
  it("leaves out the live preview's own workflows, and says how to add a deploy workflow when none is left", () => {
    answers.value.getPlaceWorkflows = { workflows: [workflow('start-live-preview'), workflow('reload-live-preview')], mayRun: true }
    deploy()
    const none = screen.getByTestId('deploy-none')
    expect(none.textContent).toContain('No deploy workflow is set up for this workspace yet')
    expect(none.textContent).toContain('they run from the live preview')
    expect(screen.queryByRole('button', { name: /Run start-live-preview/ })).toBeNull()
  })

  it('lists a deploy workflow beside them, and only that one', () => {
    answers.value.getPlaceWorkflows = { workflows: [workflow('start-live-preview'), workflow('deploy-shop')], mayRun: true }
    deploy()
    const list = screen.getByTestId('deploy-list')
    expect(within(list).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Run deploy-shop on main'])
  })
})

describe("the panel while the live preview's flag is off @SC-1773", () => {
  it('has no Live preview, and keeps the files with their labels at a laptop width', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1180 })
    show(view([footer]), '/workspaces/w1/view?branch=footer-wording&section=files')
    expect(screen.queryByRole('button', { name: /^Live preview/ })).toBeNull()
    expect(screen.queryByTestId('workspace-strip')).toBeNull()
    expect(within(screen.getByTestId('workspace-left')).getByTestId('files-tree')).toBeTruthy()
  })
})

withFeature('livePreview', () => {
describe("the strip's Live preview dot", () => {
  it('shows only while a live preview runs', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1180 })
    answers.value.getLivePreview = null
    show(view([footer]), '/workspaces/w1/view?branch=footer-wording&section=files')
    expect(screen.getByTestId('live-preview-row').textContent).toContain('Stopped')
    expect(screen.queryByTestId('strip-preview-dot')).toBeNull()
  })

  it.each(['running', 'paused', 'starting'] as const)('with a live preview %s', state => {
    // The strip shows while the live preview does.
    render(<LeftStrip branchSelect={null} section="preview" open={false} onChoose={() => {}} git previewState={state} />)
    expect(screen.queryByTestId('strip-preview-dot') !== null).toBe(state === 'running')
  })
})
})

describe('a branch that closes leaves nothing behind', () => {
  it('the address no longer names a branch that is gone', () => {
    show(view([]), '/workspaces/w1/view?branch=footer-wording&section=git')
    expect(where()).not.toContain('branch=')
    expect(where()).toContain('section=git')
  })

  it("the dock's conversation goes when it was the closed branch's thread", () => {
    const close = vi.fn()
    const dock = { open: { conversationId: 'c1', basePath: null }, close } as unknown as DockValue
    const r = show(view([footer]), '/workspaces/w1/view?branch=footer-wording&section=git', dock)
    expect(close).not.toHaveBeenCalled()
    r.rerender(view([], 6))
    expect(close).toHaveBeenCalledTimes(1)
    expect(where()).not.toContain('branch=')
  })

  it("the dock's conversation stays when it was another", () => {
    const close = vi.fn()
    const dock = { open: { conversationId: 'elsewhere', basePath: null }, close } as unknown as DockValue
    const r = show(view([footer]), '/workspaces/w1/view?branch=footer-wording&section=git', dock)
    r.rerender(view([], 6))
    expect(close).not.toHaveBeenCalled()
  })
})

describe('the view owns no conversations', () => {
  it('offers no New conversation and no New task of its own: any conversation can ask for a change', () => {
    show(view([]))
    expect(screen.queryByRole('button', { name: /New task/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /New conversation/ })).toBeNull()
    expect(screen.queryByTestId('workspace-conversation')).toBeNull()
  })
})

describe('a merge notice', () => {
  it('shows the latest merge, and goes once main moves past it', async () => {
    const r = show(view([footer]), '/workspaces/w1/view?branch=footer-wording')
    fireEvent.click(within(screen.getByTestId('workspace-top')).getByRole('button', { name: 'Merge into main…' }))
    actions.mergeBranch!.mockResolvedValue({ outcome: 'merged', versionNumber: 6, branchClosed: true })
    await act(async () => { fireEvent.click(within(screen.getByTestId('merge-dialog')).getByRole('button', { name: 'Merge footer-wording into main' })) })
    expect(screen.getByText('Merged into main as version 6. The branch is closed.')).toBeTruthy()
    r.rerender(view([], 6))
    expect(screen.getByText('Merged into main as version 6. The branch is closed.')).toBeTruthy()
    // Another merge (from a card in a conversation) takes main to version 7: the notice of 6 no longer applies.
    r.rerender(view([], 7))
    expect(screen.queryByText(/Merged into main as version 6/)).toBeNull()
  })
})
