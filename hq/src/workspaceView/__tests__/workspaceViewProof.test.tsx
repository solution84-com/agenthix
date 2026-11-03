// @vitest-environment jsdom
/**
 * The workspace view's fixes from phase 1's proof: a task's branch with no thread yet, *Deploy…* listing and running
 * the place's approved workflows, the tablet's panel and drawer, and main's versions kept readable.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import type { BranchLineView, WorkspaceBranchesView } from '../../branches/views'

const answers = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const actions = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>))
const asked = vi.hoisted(() => [] as { name: string; args: unknown }[])
vi.mock('wasp/client/operations', () => ({
  useQuery: (name: string, args: unknown, opts?: { enabled?: boolean }) => {
    if (opts?.enabled === false) return { data: undefined, error: null, refetch: vi.fn() }
    asked.push({ name, args })
    const a = answers.value[name]
    return { data: typeof a === 'function' ? (a as (x: unknown) => unknown)(args) : a, error: null, refetch: vi.fn() }
  },
  useAction: (name: string) => (actions[name] ??= vi.fn()),
  getBranchChanges: 'getBranchChanges', getBranchCommits: 'getBranchCommits', getMainVersions: 'getMainVersions',
  getGitTree: 'getGitTree', getGitFile: 'getGitFile', getTaskConversation: 'getTaskConversation', getAgents: 'getAgents',
  mergeBranch: 'mergeBranch', restoreVersion: 'restoreVersion', turnGitOn: 'turnGitOn',
  startWorkspaceConversation: 'startWorkspaceConversation', markConversationRead: vi.fn(), listLocationFiles: 'listLocationFiles',
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
vi.mock('../../storage/pages/OpenedFile', () => ({
  OpenedFile: ({ path, source }: { path: string; source?: { key: string } }) => <div>opened {path}{source ? ' from git' : ' from the site'}</div>,
}))
vi.mock('../../storage/pages/FolderTree', () => ({ FolderTree: () => <div>workspace folder</div> }))
vi.mock('../../projects/components/TaskThreadSection', () => ({
  TaskFirstMessage: ({ taskId, agentName }: { taskId: string; agentName: string | null }) => <div>first message box for {taskId} to {agentName}</div>,
}))

import { WorkspaceViewBody } from '../components/WorkspaceViewBody'
import { featuresAnswer } from '../../test/featuresAnswer'

const workspace = { id: 'w1', name: 'shop-app', ownerType: 'project' as const, ownerId: 'p1' }
const login: BranchLineView = {
  id: 'b1', name: 'login-page', ahead: 6, behind: 0, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'conversation', conversationId: 'c1', title: 'Login page', personId: 'u1', personName: 'Mia' }, working: null,
}
const cart: BranchLineView = {
  id: 'b2', name: 'fix-cart-total', ahead: 2, behind: 1, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'task', taskId: 't1', taskKey: 'SHOP-14', title: 'Fix the cart total', personId: null, personName: null }, working: { agentName: 'Kernel' },
}
const codeView = (canAct = true): WorkspaceBranchesView => ({
  git: true, canAct, main: { name: 'main', head: 'h14', versionCount: 14 }, branches: [login, cart],
})
const changes = {
  base: 'h10', head: 'h20', overflow: false, baseVersion: 12,
  files: [
    { path: 'src/App.tsx', status: 'modified', from: null, additions: 3, deletions: 1 },
    { path: 'src/OldSignIn.tsx', status: 'deleted', from: null, additions: 0, deletions: 2 },
  ],
}

function Where() {
  const l = useLocation()
  return <div data-testid="where">{l.search}</div>
}

function show(view: WorkspaceBranchesView, at = '/workspaces/w1/view') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <WorkspaceViewBody workspace={workspace} view={view} userId="u1" back={{ href: '/projects/SHOP?tool=workspaces', label: 'Fernhill Shop' }}
        workspaces={[{ id: 'w1', name: 'shop-app' }, { id: 'w2', name: 'docs' }]} refetchBranches={vi.fn()} />
      <Where />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  for (const k of Object.keys(actions)) delete actions[k]
  asked.length = 0
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
  answers.value = {
    getFeatures: featuresAnswer,
    getBranchChanges: changes,
    getGitTree: (a: { path: string }) => (a.path === ''
      ? { exists: true, overflow: false, entries: [{ name: 'src', path: 'src', kind: 'dir', bytes: null }, { name: 'README.md', path: 'README.md', kind: 'file', bytes: 10 }] }
      : { exists: true, overflow: false, entries: [{ name: 'App.tsx', path: 'src/App.tsx', kind: 'file', bytes: 40 }] }),
    getGitFile: (a: { at: string }) => ({ exists: true, binary: false, tooLarge: false, bytes: 5, text: a.at === 'base' ? 'one\n' : 'one\ntwo\n' }),
    getMainVersions: { hasMore: false, versions: [
      { number: 14, commit: 'h14', subject: 'Kernel for Mia · Checkout page', author: { name: 'Mia', email: 'm@x' }, files: 5, at: new Date().toISOString() },
      { number: 13, commit: 'h13', subject: 'Ada · Fix the README links', author: { name: 'Ada', email: 'a@x' }, files: 1, at: new Date().toISOString() },
    ] },
    getTaskConversation: { conversation: { id: 'tc1' }, lead: null, canStart: false, refusal: null },
    getAgents: [],
    getPlaceWorkflows: { workflows: [], mayRun: true, mayAdminister: false },
  }
})


const deployWorkflow = (over: Record<string, unknown> = {}) => ({
  id: 'wf1', name: 'deploy-site', description: 'Deploys main to the web server', enabled: true, waiting: [], lastRun: null,
  approved: { number: 2, hash: 'x', definition: { description: 'Deploys main', parameters: [], steps: [], variables: [] } },
  ...over,
})

describe('a task\'s branch whose task has no thread yet @SC-1685', () => {
  it('offers the box whose first message starts the task\'s thread', async () => {
    answers.value.getTaskConversation = { conversation: null, lead: { id: 'a1', name: 'Ivy' }, canStart: true, refusal: null }
    show(codeView(), '/workspaces/w1/view?branch=fix-cart-total')
    const panel = await screen.findByTestId('task-first-message')
    expect(panel.textContent).toContain('first message box for t1 to Ivy')
    expect(panel.textContent).toContain('Ivy reads them at its next run')
    expect(screen.queryByText(/has no conversation yet/)).toBeNull()
  })

  it('says why, for a person who may not talk there', async () => {
    answers.value.getTaskConversation = { conversation: null, lead: { id: 'a1', name: 'Ivy' }, canStart: false, refusal: 'Talking on this task needs the Member or Admin role.' }
    show(codeView(false), '/workspaces/w1/view?branch=fix-cart-total')
    const panel = await screen.findByTestId('task-first-message')
    expect(panel.textContent).toContain('Talking on this task needs the Member or Admin role.')
    expect(panel.textContent).not.toContain('first message box')
  })
})

describe('Deploy… @SC-1691', () => {
  const openDeploy = () => {
    show(codeView())
    fireEvent.click(within(screen.getByTestId('main-git')).getByRole('button', { name: 'Deploy…' }))
  }

  it('lists the place\'s approved workflows that are on, and runs the one chosen on this workspace', async () => {
    answers.value.getPlaceWorkflows = { mayRun: true, mayAdminister: false, workflows: [
      deployWorkflow(), deployWorkflow({ id: 'wf2', name: 'off', enabled: false }), deployWorkflow({ id: 'wf3', name: 'unapproved', approved: null }),
    ] }
    actions.startWorkflowRun = vi.fn(async () => ({ runId: 'r9' }))
    openDeploy()
    const list = screen.getByTestId('deploy-list')
    expect(within(list).getAllByRole('listitem').map(li => li.textContent)).toEqual([expect.stringContaining('deploy-site')])
    expect(asked.some(q => q.name === 'getPlaceWorkflows' && JSON.stringify(q.args) === JSON.stringify({ place: { type: 'project', id: 'p1' } }))).toBe(true)
    await act(async () => { fireEvent.click(within(list).getByRole('button', { name: 'Run deploy-site on main' })) })
    expect(actions.startWorkflowRun).toHaveBeenCalledWith({ workflowId: 'wf1', workspaceId: 'w1', parameters: {} })
    expect(within(list).getByRole('link', { name: 'See the run' }).getAttribute('href')).toBe('/workflows/wf1/runs/r9')
  })

  it('lets a person who may not start runs see the list and run nothing', () => {
    answers.value.getPlaceWorkflows = { mayRun: false, mayAdminister: false, workflows: [deployWorkflow()] }
    openDeploy()
    const button = within(screen.getByTestId('deploy-list')).getByRole('button', { name: 'Run deploy-site on main' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('keeps the line saying how to add one, when the place has none', () => {
    answers.value.getPlaceWorkflows = { mayRun: true, mayAdminister: false, workflows: [deployWorkflow({ enabled: false })] }
    openDeploy()
    expect(screen.getByTestId('main-git').textContent).toContain('No deploy workflow is set up for this workspace yet')
  })
})

describe('the tablet\'s panel and drawer @SC-1689', () => {
  beforeEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 }) })

  it('Escape closes Files or Git open over the middle', () => {
    show(codeView(), '/workspaces/w1/view?branch=login-page&section=files')
    fireEvent.click(screen.getByRole('button', { name: 'Git' }))
    expect(screen.getByTestId('workspace-over')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('workspace-over')).toBeNull()
  })

  it('opening the conversation closes the panel, and opening the panel closes the conversation', () => {
    show(codeView(), '/workspaces/w1/view?branch=login-page&section=files')
    fireEvent.click(screen.getByRole('button', { name: 'Git' }))
    fireEvent.click(screen.getByRole('button', { name: 'Conversation' }))
    expect(screen.queryByTestId('workspace-over')).toBeNull()
    const drawer = screen.getByTestId('workspace-conversation')
    expect(drawer.className).not.toContain('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    expect(screen.getByTestId('workspace-over')).toBeTruthy()
    expect(drawer.className).toContain('hidden')
  })
})

describe('main\'s versions @SC-1691', () => {
  it('wrap a long summary to two lines instead of cutting it to a few words', () => {
    show(codeView())
    const summary = within(screen.getByTestId('main-git')).getByText('Ada · Fix the README links')
    expect(summary.className).toContain('line-clamp-2')
    expect(summary.className).not.toContain('truncate')
  })
})
