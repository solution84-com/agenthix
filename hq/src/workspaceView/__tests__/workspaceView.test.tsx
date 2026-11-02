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

describe('the workspace view', () => {
  it('has the back link and the workspace switcher, and no Live preview while its flag is off @SC-1683', () => {
    show(codeView())
    expect(screen.getByRole('link', { name: /Fernhill Shop/ }).getAttribute('href')).toBe('/projects/SHOP?tool=workspaces')
    fireEvent.click(screen.getByRole('button', { name: 'Workspace: shop-app' }))
    expect(screen.getByRole('menuitem', { name: 'docs' }).getAttribute('href')).toBe('/workspaces/w2/view')
    expect(screen.queryByTestId('live-preview-row')).toBeNull()
    expect(screen.queryByText(/Live preview/)).toBeNull()
    expect(asked.some(a => a.name === 'getLivePreviewPlaces' || a.name === 'getLivePreview')).toBe(false)
  })

  it('opens Git where an address names Live preview while its flag is off', () => {
    show(codeView(), '/workspaces/w1/view?branch=login-page&section=preview')
    expect(screen.getByTestId('branch-git')).toBeTruthy()
    expect(screen.queryByTestId('live-preview-row')).toBeNull()
  })

  withFeature('livePreview', () => {
    it('has Live preview first in the panel with its state @SC-1683', () => {
      show(codeView())
      const row = screen.getByTestId('live-preview-row')
      expect(row.textContent).toContain('Stopped')
    })
  })

  it('opens on main, protected, with its versions, Restore and a quiet Deploy… that says none is set up @SC-1691', () => {
    show(codeView())
    expect(screen.getByRole('button', { name: 'Branch: main' })).toBeTruthy()
    const git = screen.getByTestId('main-git')
    expect(git.textContent).toContain('Protected. Moves forward only')
    expect(within(git).getByText('Ada · Fix the README links')).toBeTruthy()
    expect(within(git).getAllByRole('button', { name: /Restore/ })).toHaveLength(1)
    fireEvent.click(within(git).getByRole('button', { name: 'Deploy…' }))
    expect(git.textContent).toContain('No deploy workflow is set up for this workspace yet')
    expect(screen.queryByRole('button', { name: /Merge into main/ })).toBeNull()
    expect(screen.getByTestId('main-conversation').textContent).toContain('main has no conversation of its own')
  })

  it('lists main first and each branch on one line, with whose, what works on it, and how far ahead and behind @SC-1684', () => {
    show(codeView())
    fireEvent.click(screen.getByRole('button', { name: 'Branch: main' }))
    const options = screen.getAllByRole('option')
    expect(options.map(o => o.textContent)).toEqual([
      expect.stringContaining('main'),
      expect.stringContaining('login-page'),
      expect.stringContaining('fix-cart-total'),
    ])
    expect(options[2].textContent).toContain('Task SHOP-14')
    expect(options[2].textContent).toContain('Kernel is working here')
    expect(options[2].textContent).toContain('2 ahead · 1 behind')
    expect(options[1].textContent).toContain('You, with Kernel')
    expect(screen.getByText(/Each branch has its own working copy/)).toBeTruthy()
    expect(screen.getByText('A conversation or task on this workspace makes its own branch.')).toBeTruthy()
    expect(screen.queryByText(/New branch/)).toBeNull()
  })

  it('choosing a branch sets the address, its Git, and its conversation on the right @SC-1684', async () => {
    show(codeView())
    fireEvent.click(screen.getByRole('button', { name: 'Branch: main' }))
    fireEvent.click(screen.getAllByRole('option')[1].querySelector('button')!)
    expect(screen.getByTestId('where').textContent).toContain('branch=login-page')
    expect(screen.getByTestId('branch-git').textContent).toContain('6 ahead of main')
    expect(await screen.findByText('thread c1')).toBeTruthy()
  })

  it('a task’s branch shows the task’s thread @SC-1685', async () => {
    show(codeView(), '/workspaces/w1/view?branch=fix-cart-total&section=git')
    expect(await screen.findByText('thread tc1')).toBeTruthy()
  })

  it('the conversation follows the branch, whatever conversation the address’s c= names @SC-1685', async () => {
    show(codeView(), '/workspaces/w1/view?branch=fix-cart-total&section=git&c=other')
    expect(await screen.findByText('thread tc1')).toBeTruthy()
    expect(screen.queryByText('thread other')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Branch: / }))
    fireEvent.click(screen.getAllByRole('option')[1].querySelector('button')!)
    expect(await screen.findByText('thread c1')).toBeTruthy()
    expect(screen.queryByText('thread other')).toBeNull()
  })

  it('a change opens its diff in the middle, base against tip @SC-1687', () => {
    show(codeView(), '/workspaces/w1/view?branch=login-page&section=git')
    fireEvent.click(within(screen.getByTestId('branch-git')).getByText('App.tsx'))
    expect(screen.getByTestId('where').textContent).toContain('diff=src%2FApp.tsx')
    const diff = screen.getByTestId('workspace-diff')
    expect(within(diff).getByRole('table', { name: 'Changes' })).toBeTruthy()
    expect(asked.some(q => q.name === 'getGitFile' && (q.args as { at: string }).at === 'base')).toBe(true)
    expect(screen.getByText(/changes compared with main at v12/)).toBeTruthy()
  })

  it('Files lists the branch’s tree with each file marked, a deleted file kept where it was @SC-1686', () => {
    show(codeView(), '/workspaces/w1/view?branch=login-page&section=files')
    fireEvent.click(screen.getByRole('button', { name: /^src/ }))
    expect(screen.getByRole('img', { name: 'modified' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'deleted' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /App\.tsx/ }))
    expect(screen.getByText('opened src/App.tsx from git')).toBeTruthy()
  })
})

describe('Merge into main @SC-1690', () => {
  const open = () => {
    show(codeView(), '/workspaces/w1/view?branch=login-page&section=git')
    fireEvent.click(screen.getByRole('button', { name: /Merge into main…/ }))
    return screen.getByTestId('merge-dialog')
  }

  it('shows the files, a summary from the work, and the version it goes in as', () => {
    const dialog = open()
    expect((within(dialog).getByRole('textbox') as HTMLInputElement).value).toBe('Kernel for Mia · Login page')
    expect(dialog.textContent).toContain('one version — version 15')
    expect(dialog.textContent).toContain('src/OldSignIn.tsx')
    expect(dialog.textContent).toContain('The branch’s 6 commits become that one version.')
  })

  it('says one commit becomes that one version', () => {
    show({ git: true, canAct: true, main: { name: 'main', head: 'h14', versionCount: 14 }, branches: [{ ...login, ahead: 1 }] }, '/workspaces/w1/view?branch=login-page&section=git')
    fireEvent.click(screen.getByRole('button', { name: /Merge into main…/ }))
    expect(screen.getByTestId('merge-dialog').textContent).toContain('The branch’s 1 commit becomes that one version.')
  })

  it('a clean merge goes in as one version against the main it showed, and says so', async () => {
    const dialog = open()
    actions.mergeBranch!.mockResolvedValue({ outcome: 'merged', versionNumber: 15, branchClosed: false })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Merge into main$/ }))
    await waitFor(() => expect(screen.queryByTestId('merge-dialog')).toBeNull())
    expect(actions.mergeBranch).toHaveBeenCalledWith({ branchId: 'b1', message: 'Kernel for Mia · Login page', expectedMain: 'h14' })
    expect(screen.getByText(/Merged into main as version 15/)).toBeTruthy()
  })

  it('a clash merges nothing, names the files and the version, and says the agent will bring the branch up to date', async () => {
    const dialog = open()
    actions.mergeBranch!.mockResolvedValue({
      outcome: 'clash', agentAsked: true,
      clashes: [{ path: 'src/App.tsx', version: { number: 15, commit: 'c15', subject: 'Ada · Dark mode switch' } }],
    })
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: /^Merge into main$/ })) })
    expect(dialog.textContent).toContain('Nothing was merged.')
    expect(dialog.textContent).toContain('version 15 “Ada · Dark mode switch”')
    expect(dialog.textContent).toContain('Kernel will bring the branch up to date')
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('while an agent works on the branch, it says the merge takes what is committed so far', () => {
    show(codeView(), '/workspaces/w1/view?branch=fix-cart-total&section=git')
    fireEvent.click(screen.getByRole('button', { name: /Merge into main…/ }))
    expect(screen.getByTestId('merge-dialog').textContent).toContain('Kernel is still working on this branch. This merges what it has committed so far; it keeps working.')
  })
})

describe('who sees what, and a workspace without Git', () => {
  it('a Viewer sees everything and acts on nothing, with the reason @SC-1692', async () => {
    show(codeView(false), '/workspaces/w1/view?branch=login-page&section=git')
    const merge = screen.getByRole('button', { name: /Merge into main…/ }) as HTMLButtonElement
    expect(merge.disabled).toBe(true)
    expect(screen.getByTestId('branch-git').textContent).toContain('need a Member or Admin')
    expect(await screen.findByText('thread c1')).toBeTruthy()
  })

  it('a Viewer on main gets no Restore and no New conversation @SC-1692', () => {
    show(codeView(false))
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull()
    expect((screen.getByRole('button', { name: /New conversation/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('without Git: Files only, and Turn Git on where Live preview and Git would be @SC-1693', async () => {
    show({ git: false, canAct: true })
    expect(screen.getByText('workspace folder')).toBeTruthy()
    expect(screen.queryByTestId('live-preview-row')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Git/ })).toBeNull()
    // No main and no branches yet: a conversation here works in the workspace's files.
    const talk = screen.getByTestId('main-conversation').textContent ?? ''
    expect(talk).not.toContain('main')
    expect(talk).not.toContain('branch')
    expect(talk).toContain("shop-app's files")
    fireEvent.click(screen.getByRole('button', { name: /Turn Git on/ }))
    expect(screen.getByText(/shop-app isn't a Git repository yet/)).toBeTruthy()
    actions.turnGitOn!.mockResolvedValue({ versionNumber: 1, leftOut: ['big.bin'] })
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Turn Git on' })) })
    expect(actions.turnGitOn).toHaveBeenCalledWith({ workspaceId: 'w1' })
    expect(screen.getByText(/big\.bin/)).toBeTruthy()
  })

  it('New conversation on main starts one in this workspace and shows it @SC-1685', async () => {
    show(codeView())
    actions.startWorkspaceConversation!.mockResolvedValue({ conversationId: 'new1' })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /New conversation/ })) })
    expect(actions.startWorkspaceConversation).toHaveBeenCalledWith({ workspaceId: 'w1' })
    expect(await screen.findByText('thread new1')).toBeTruthy()
  })
})

describe('narrow screens @SC-1689', () => {
  it('on a laptop the panel folds to its strip, and Git opens over the middle', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1180 })
    show(codeView(), '/workspaces/w1/view?branch=login-page&section=files')
    expect(screen.getByTestId('workspace-strip')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Git' }))
    expect(within(screen.getByTestId('workspace-over')).getByTestId('branch-git')).toBeTruthy()
  })

  it('on a tablet the conversation is a drawer opened from the top bar', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 })
    show(codeView(), '/workspaces/w1/view?branch=login-page')
    const drawer = screen.getByTestId('workspace-conversation')
    expect(drawer.className).toContain('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Conversation' }))
    expect(drawer.className).not.toContain('hidden')
  })

  it('on a phone the conversation is the main view, with a switch at the bottom', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    show(codeView(), '/workspaces/w1/view?branch=login-page')
    expect(await screen.findByText('thread c1')).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Workspace' })
    expect(within(nav).getAllByRole('button').map(b => b.textContent)).toEqual(['Conversation', 'Files', 'Git'])
    fireEvent.click(within(nav).getByRole('button', { name: 'Git' }))
    expect(screen.getByTestId('branch-git')).toBeTruthy()
  })

  withFeature('livePreview', () => {
    it('on a phone Live preview is one of the switch', async () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
      show(codeView(), '/workspaces/w1/view?branch=login-page')
      const nav = screen.getByRole('navigation', { name: 'Workspace' })
      expect(within(nav).getAllByRole('button').map(b => b.textContent)).toEqual(['Conversation', 'Live preview', 'Files', 'Git'])
    })
  })
})
