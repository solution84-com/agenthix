// @vitest-environment jsdom
/**
 * What the owner's walk found in the workspace view: Deploy… lists no live-preview workflow, the strip's dot means a
 * live preview runs, a closed branch leaves nothing behind in the address or the notice, and *New task* makes a task
 * on this workspace and shows its branch once its run makes it.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import type { BranchLineView, WorkspaceBranchesView } from '../../branches/views'
import { DockContext, type DockValue } from '../../dock/DockContext'

const answers = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const actions = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>))
vi.mock('wasp/client/operations', () => ({
  useQuery: (name: string, args: unknown, opts?: { enabled?: boolean }) => {
    if (opts?.enabled === false) return { data: undefined, error: null, refetch: vi.fn() }
    const a = answers.value[name]
    return { data: typeof a === 'function' ? (a as (x: unknown) => unknown)(args) : a, error: null, refetch: vi.fn() }
  },
  useAction: (name: string) => (actions[name] ??= vi.fn()),
  getBranchChanges: 'getBranchChanges', getBranchCommits: 'getBranchCommits', getMainVersions: 'getMainVersions',
  getGitTree: 'getGitTree', getGitFile: 'getGitFile', getTaskConversation: 'getTaskConversation', getAgents: 'getAgents',
  getProject: 'getProject', createTask: 'createTask', runTask: 'runTask',
  mergeBranch: 'mergeBranch', restoreVersion: 'restoreVersion', turnGitOn: 'turnGitOn',
  startWorkspaceConversation: 'startWorkspaceConversation', markConversationRead: vi.fn(), listLocationFiles: 'listLocationFiles',
  getPlaceWorkflows: 'getPlaceWorkflows', startWorkflowRun: 'startWorkflowRun', startTaskConversation: 'startTaskConversation',
  getLivePreviewPlaces: 'getLivePreviewPlaces', getLivePreview: 'getLivePreview', markLivePreviewInUse: 'markLivePreviewInUse',
  startLivePreview: 'startLivePreview', stopLivePreview: 'stopLivePreview', resumeLivePreview: 'resumeLivePreview',
  reloadLivePreview: 'reloadLivePreview', setLivePreviewAuto: 'setLivePreviewAuto', openLiveApp: 'openLiveApp',
  answerLivePreviewQuestion: 'answerLivePreviewQuestion', runLivePreviewWorkflow: 'runLivePreviewWorkflow',
}))
vi.mock('../../conversations/components/ConversationThread', () => ({
  ConversationThread: ({ conversationId }: { conversationId: string }) => <div>thread {conversationId}</div>,
}))
vi.mock('../../storage/pages/OpenedFile', () => ({ OpenedFile: ({ path }: { path: string }) => <div>opened {path}</div> }))
vi.mock('../../storage/pages/FolderTree', () => ({ FolderTree: () => <div>workspace folder</div> }))

import { WorkspaceViewBody } from '../components/WorkspaceViewBody'

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
        workspaces={[{ id: 'w1', name: 'shop-app' }]} refetchBranches={vi.fn()} />
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
    getBranchChanges: { base: 'h4', head: 'h9', overflow: false, baseVersion: 5, files: [] },
    getMainVersions: { hasMore: false, versions: [] },
    getGitTree: { exists: true, overflow: false, entries: [] },
    getTaskConversation: { conversation: { id: 'tc1' }, lead: null, canStart: false, refusal: null },
    getAgents: [{ id: 'a1', name: 'Kernel', handle: 'kernel' }],
    getProject: { agents: [{ agent: { id: 'a1' } }] },
    getPlaceWorkflows: { workflows: [], mayRun: true, mayAdminister: false },
  }
})

describe('Deploy… on main', () => {
  it("leaves out the live preview's own workflows, and says how to add a deploy workflow when none is left", () => {
    answers.value.getPlaceWorkflows = { workflows: [workflow('start-live-preview'), workflow('reload-live-preview')], mayRun: true }
    show(view([]), '/workspaces/w1/view?section=git')
    fireEvent.click(screen.getByRole('button', { name: 'Deploy…' }))
    const none = screen.getByTestId('deploy-none')
    expect(none.textContent).toContain('No deploy workflow is set up for this workspace yet')
    expect(none.textContent).toContain('they run from the live preview')
    expect(screen.queryByRole('button', { name: /Run start-live-preview/ })).toBeNull()
  })

  it('lists a deploy workflow beside them, and only that one', () => {
    answers.value.getPlaceWorkflows = { workflows: [workflow('start-live-preview'), workflow('deploy-shop')], mayRun: true }
    show(view([]), '/workspaces/w1/view?section=git')
    fireEvent.click(screen.getByRole('button', { name: 'Deploy…' }))
    const list = screen.getByTestId('deploy-list')
    expect(within(list).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Run deploy-shop on main'])
  })
})

describe("the strip's Live preview dot", () => {
  it('shows only while a live preview runs', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1180 })
    answers.value.getLivePreview = null
    show(view([footer]), '/workspaces/w1/view?branch=footer-wording&section=files')
    expect(screen.getByRole('button', { name: /^Live preview · Stopped/ })).toBeTruthy()
    expect(screen.queryByTestId('strip-preview-dot')).toBeNull()
  })

  it.each(['running', 'paused', 'starting'] as const)('with a live preview %s', state => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1180 })
    answers.value.getLivePreviewPlaces = { current: { livePreviewId: 'lp1', state } }
    answers.value.getLivePreview = { livePreviewId: 'lp1', state }
    show(view([footer]), '/workspaces/w1/view?branch=footer-wording&section=files')
    expect(screen.queryByTestId('strip-preview-dot') !== null).toBe(state === 'running')
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

  it('a merge notice shows the latest merge, and goes once main moves past it', async () => {
    const r = show(view([footer]), '/workspaces/w1/view?branch=footer-wording&section=git')
    actions.mergeBranch = vi.fn().mockResolvedValue({ outcome: 'merged', versionNumber: 6, branchClosed: true })
    fireEvent.click(screen.getByRole('button', { name: /Merge into main…/ }))
    await act(async () => { fireEvent.click(within(screen.getByTestId('merge-dialog')).getByRole('button', { name: /^Merge into main$/ })) })
    expect(screen.getByText('Merged into main as version 6. The branch is closed.')).toBeTruthy()
    r.rerender(view([], 6))
    expect(screen.getByText('Merged into main as version 6. The branch is closed.')).toBeTruthy()
    // Another merge (from a card in a conversation) takes main to version 7: the notice of 6 no longer applies.
    r.rerender(view([], 7))
    expect(screen.queryByText(/Merged into main as version 6/)).toBeNull()
  })
})

describe('New task in the workspace view', () => {
  it('makes a task on this workspace with its assignee, title and description, starts it, and shows its branch once made', async () => {
    const r = show(view([]))
    actions.createTask = vi.fn().mockResolvedValue({ id: 't9', title: 'Free delivery over $50', number: 9 })
    actions.runTask = vi.fn().mockResolvedValue(undefined)
    fireEvent.click(screen.getByRole('button', { name: /New task/ }))
    const dialog = screen.getByTestId('new-task-dialog')
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Free delivery over $50' } })
    fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'A banner on the home page' } })
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Make and start' })) })
    expect(actions.createTask).toHaveBeenCalledWith({
      projectId: 'p1', title: 'Free delivery over $50', description: 'A banner on the home page', assignedAgentId: 'a1', workspaceId: 'w1',
    })
    expect(actions.runTask).toHaveBeenCalledWith({ taskId: 't9' })
    expect(screen.getByTestId('pending-task').textContent).toContain('Free delivery over $50')

    const made: BranchLineView = {
      ...footer, id: 'b9', name: 'free-delivery-over-50',
      whose: { kind: 'task', taskId: 't9', taskKey: 'SHOP-9', title: 'Free delivery over $50', personId: 'u1', personName: 'Mia' },
    }
    r.rerender(view([made]))
    expect(where()).toContain('branch=free-delivery-over-50')
    expect(screen.queryByTestId('pending-task')).toBeNull()
  })

  it("is not offered in a person's own space, where tasks are not made", () => {
    render(
      <MemoryRouter initialEntries={['/workspaces/w1/view']}>
        <WorkspaceViewBody workspace={{ ...workspace, ownerType: 'user', ownerId: 'u1' }} view={view([])} userId="u1"
          back={{ href: '/space?tool=workspaces', label: 'Your space' }} workspaces={[]} refetchBranches={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /New task/ })).toBeNull()
  })
})
