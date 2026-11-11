// @vitest-environment jsdom
/**
 * The workspace view's fixes from phase 1's proof: *Deploy…* listing and running the place's approved workflows.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import type { BranchLineView, WorkspaceBranchesView } from '../../branches/views'

const answers = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const actions = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>))
const asked = vi.hoisted(() => [] as { name: string; args: unknown }[])
// The person's foot and its phone rows have their own tests (viewFoot.test.tsx).
vi.mock('../components/PhonePersonRows', () => ({ PhonePersonRows: () => null }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (name: string, args: unknown, opts?: { enabled?: boolean }) => {
    if (opts?.enabled === false) return { data: undefined, error: null, refetch: vi.fn() }
    asked.push({ name, args })
    const a = answers.value[name]
    return { data: typeof a === 'function' ? (a as (x: unknown) => unknown)(args) : a, error: null, refetch: vi.fn() }
  },
  useAction: (name: string) => (actions[name] ??= vi.fn()),
  getBranchChanges: 'getBranchChanges', getMainVersionAt: 'getMainVersionAt', getMainVersionChanges: 'getMainVersionChanges', getBranchCommits: 'getBranchCommits', getMainVersions: 'getMainVersions',
  getGitTree: 'getGitTree', getGitFile: 'getGitFile', getTaskConversation: 'getTaskConversation', getAgents: 'getAgents',
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
vi.mock('../../storage/pages/OpenedFile', () => ({
  OpenedFile: ({ path, source }: { path: string; source?: { key: string } }) => <div>opened {path}{source ? ' from git' : ' from the site'}</div>,
}))
vi.mock('../../storage/pages/FolderTree', () => ({ FolderTree: () => <div>workspace folder</div> }))
vi.mock('../../projects/components/TaskThreadSection', () => ({
  TaskFirstMessage: ({ taskId, agentName }: { taskId: string; agentName: string | null }) => <div>first message box for {taskId} to {agentName}</div>,
}))

import { WorkspaceViewBody } from '../components/WorkspaceViewBody'
import { DeployList } from '../components/DeployList'
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
        workspaces={[{ id: 'w1', name: 'shop-app' }, { id: 'w2', name: 'docs' }]} place={{ kind: "project", key: "SHOP" }} refetchBranches={vi.fn()} />
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

describe('Deploy… @SC-1691', () => {
  const openDeploy = () => render(<MemoryRouter><DeployList place={{ type: 'project', id: 'p1' }} workspaceId="w1" /></MemoryRouter>)

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
    expect(within(list).queryByRole('link', { name: 'See the run' })).toBeNull()
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
    expect(document.body.textContent).toContain('No deploy workflow is set up for this workspace yet')
  })
})
