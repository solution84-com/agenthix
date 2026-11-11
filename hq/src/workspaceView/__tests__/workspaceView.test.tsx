// @vitest-environment jsdom
/**
 * The full-screen workspace view (live preview spec, part 1, and part 3's Merge into main and Restore), against the
 * branch operations' types with their answers given here.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { withFeature } from '@agenthix/core/testing'
import type { BranchLineView, WorkspaceBranchesView } from '../../branches/views'
import { featuresAnswer } from '../../test/featuresAnswer'

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

import { WorkspaceViewBody } from '../components/WorkspaceViewBody'

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
    getFeatures: featuresAnswer,
  }
})

describe('the workspace view @SC-1929', () => {
  it('has the back link and the workspace switcher, and no Live preview while its flag is off @SC-1683 @SC-1773', () => {
    show(codeView())
    expect(screen.getByRole('link', { name: /Fernhill Shop/ }).getAttribute('href')).toBe('/projects/SHOP?tool=workspaces')
    fireEvent.click(screen.getByRole('button', { name: 'Workspace: shop-app' }))
    expect(screen.getByRole('menuitem', { name: 'docs' }).getAttribute('href')).toBe('/workspaces/w2/view')
    expect(screen.queryByTestId('live-preview-row')).toBeNull()
    expect(screen.queryByText(/Live preview/)).toBeNull()
    expect(asked.some(a => a.name === 'getLivePreviewPlaces' || a.name === 'getLivePreview')).toBe(false)
  })

  it('opens Files where an address names Live preview while its flag is off @SC-1773', () => {
    show(codeView(), '/workspaces/w1/view?branch=login-page&section=preview')
    expect(screen.getByTestId('files-tree')).toBeTruthy()
    expect(screen.queryByTestId('live-preview-row')).toBeNull()
  })

  withFeature('livePreview', () => {
    it('has Live preview first in the panel with its state @SC-1683', () => {
      show(codeView())
      const row = screen.getByTestId('live-preview-row')
      expect(row.textContent).toContain('Stopped')
    })
  })

  it('choosing a branch sets the address and its files, and opens no conversation @SC-1684', () => {
    show(codeView())
    fireEvent.click(screen.getByRole('button', { name: 'Branch: main' }))
    fireEvent.click(within(screen.getByTestId('branch-list')).getByRole('button', { name: /^login-page/ }))
    expect(screen.getByTestId('where').textContent).toContain('branch=login-page')
    expect(screen.getByRole('button', { name: /Only changed · 2/ })).toBeTruthy()
    expect(screen.queryByText('thread c1')).toBeNull()
  })

  it('the view draws no conversation, whatever the address’s c= names @SC-1685', () => {
    show(codeView(), '/workspaces/w1/view?branch=fix-cart-total&c=other')
    expect(screen.queryByText(/^thread /)).toBeNull()
    expect(screen.queryByTestId('workspace-conversation')).toBeNull()
  })
})

describe('Merge into main @SC-1690', () => {
  const top = () => within(screen.getByTestId('workspace-top'))
  const open = () => {
    show(codeView(), '/workspaces/w1/view?branch=login-page')
    fireEvent.click(top().getByRole('button', { name: 'Merge into main…' }))
    return screen.getByTestId('merge-dialog')
  }

  it("opens by a merge request's link with the dialog open, and the address drops the request", () => {
    show(codeView(), '/workspaces/w1/view?branch=login-page&merge=1')
    expect(screen.getByTestId('merge-dialog')).toBeTruthy()
    expect(screen.getByTestId('where').textContent).not.toContain('merge=1')
  })

  it("says, beside the button, that an agent's merge request waits for an answer", () => {
    const asked = { ...codeView(), branches: [{ ...login, mergeAsked: { agentName: 'Kernel' } }, cart] }
    show(asked, '/workspaces/w1/view?branch=login-page')
    expect(top().getByTestId('merge-asked').textContent).toBe('Kernel asked to merge this and waits for an answer')
    expect(top().getByRole('button', { name: 'Merge into main…' })).toBeTruthy()
  })

  it('shows the files, a summary from the work, and the version it goes in as, without the word commit', () => {
    const dialog = open()
    expect((within(dialog).getByRole('textbox') as HTMLInputElement).value).toBe('Kernel for Mia · Login page')
    expect(dialog.textContent).toContain('one version — version 15')
    expect(dialog.textContent).toContain('src/OldSignIn.tsx')
    expect(dialog.textContent).not.toContain('commit')
  })

  it('a clean merge goes in as one version against the main it showed', async () => {
    const dialog = open()
    actions.mergeBranch!.mockResolvedValue({ outcome: 'merged', versionNumber: 15, branchClosed: false })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge login-page into main' }))
    await waitFor(() => expect(screen.queryByTestId('merge-dialog')).toBeNull())
    expect(actions.mergeBranch).toHaveBeenCalledWith({ branchId: 'b1', message: 'Kernel for Mia · Login page', expectedMain: 'h14' })
    // The new version in the versions list is the result: no message says it was merged.
    expect(screen.queryByText(/Merged into main as version 15/)).toBeNull()
  })

  it('a clash merges nothing, names the file, and ends with Bring up to date rather than a promise', async () => {
    const dialog = open()
    actions.mergeBranch!.mockResolvedValue({ outcome: 'clash', agentAsked: false, clashes: [{ path: 'src/App.tsx', version: null }] })
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Merge login-page into main' })) })
    expect(dialog.textContent).toContain('This branch and main both changed src/App.tsx. Bring the branch up to date first.')
    expect(dialog.textContent).not.toContain('will bring')
    expect(within(dialog).getByRole('button', { name: 'Not now' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Bring up to date' })).toBeTruthy()
  })

  it('while an agent works on the branch, it says the merge takes what is committed so far', () => {
    show({ ...codeView(), branches: [{ ...login, working: { agentName: 'Kernel' } }] } as WorkspaceBranchesView, '/workspaces/w1/view?branch=login-page')
    fireEvent.click(top().getByRole('button', { name: 'Merge into main…' }))
    expect(screen.getByTestId('merge-dialog').textContent).toContain('Kernel is still working on this branch. This merges what it has committed so far; it keeps working.')
  })
})

describe('who sees what, and a workspace without Git', () => {
  it('a Viewer sees the branch and its changes, and no next step @SC-1692', () => {
    show(codeView(false), '/workspaces/w1/view?branch=login-page')
    expect(screen.getByTestId('changed-file')).toBeTruthy()
    expect(within(screen.getByTestId('workspace-top')).queryByRole('button', { name: /Merge into main/ })).toBeNull()
  })

  it('nothing in the view starts a conversation or a task of its own @SC-1692', () => {
    show(codeView())
    expect(screen.queryByRole('button', { name: /New conversation/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /New task/ })).toBeNull()
  })

  it('without Git: Files only, and Keep versions with Git… top right @SC-1693', async () => {
    show({ git: false, canAct: true })
    expect(screen.getByText('workspace folder')).toBeTruthy()
    expect(screen.queryByTestId('live-preview-row')).toBeNull()
    fireEvent.click(within(screen.getByTestId('workspace-top')).getByRole('button', { name: 'Keep versions with Git…' }))
    expect(screen.getByText(/This can't be undone\./)).toBeTruthy()
    actions.turnGitOn!.mockResolvedValue({ versionNumber: 1, leftOut: ['big.bin'], gitignoreAdded: false })
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Turn on Git for shop-app' })) })
    expect(actions.turnGitOn).toHaveBeenCalledWith({ workspaceId: 'w1' })
    // Files left out are something to act on: a quiet line under the bar, with Dismiss, not a dialog.
    const note = screen.getByTestId('git-on-note')
    expect(note.textContent).toContain('big.bin')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(within(note).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('git-on-note')).toBeNull()
  })
})

describe('narrow screens @SC-1689', () => {
  it('on a laptop and a tablet the panel keeps its labels, with no strip and no conversation of the view', () => {
    for (const width of [1180, 820]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
      const { unmount } = show(codeView(), '/workspaces/w1/view?branch=login-page')
      expect(screen.getByTestId('workspace-left')).toBeTruthy()
      expect(screen.getByTestId('files-tree')).toBeTruthy()
      expect(screen.queryByTestId('workspace-strip')).toBeNull()
      expect(screen.queryByTestId('workspace-conversation')).toBeNull()
      unmount()
    }
  })

  it('on a phone the files are full width and the next step is at the foot', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    show(codeView(), '/workspaces/w1/view?branch=login-page')
    expect(screen.getByTestId('files-tree')).toBeTruthy()
    expect(within(screen.getByTestId('phone-foot')).getByRole('button', { name: 'Merge into main…' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Workspace' })).toBeNull()
  })

  withFeature('livePreview', () => {
    it('on a phone Live preview is in ⋮', () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
      show(codeView(), '/workspaces/w1/view?branch=login-page')
      fireEvent.click(screen.getByRole('button', { name: 'More' }))
      fireEvent.click(within(screen.getByRole('dialog', { name: 'shop-app' })).getByRole('button', { name: 'Live preview' }))
      expect(screen.getByTestId('where').textContent).toContain('section=preview')
    })
  })
})
