// @vitest-environment jsdom
/**
 * The workspace view's frame and flow (design pass, area 7): the breadcrumb (the branch ▾, 💬 Chat, main's version
 * ▾), the one next-step button and what it starts, Turning Git on, About, the phone's frame, and the page for a
 * workspace that cannot be opened. The chat is the app's panel: the view opens it only from 💬 Chat.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import type { BranchLineView, WorkspaceBranchesView } from '../../branches/views'
import { DockContext, type DockValue } from '../../dock/DockContext'
import { featuresAnswer } from '../../test/featuresAnswer'

const answers = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const actions = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>))
const taskConversation = vi.hoisted(() => vi.fn(async () => ({ conversation: null as null | { id: string } })))
// The person's phone rows have their own tests (phonePersonRows.test.tsx).
vi.mock('../components/PhonePersonRows', () => ({ PhonePersonRows: () => null }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (name: string, args: unknown, opts?: { enabled?: boolean }) => {
    if (opts?.enabled === false) return { data: undefined, error: null, refetch: vi.fn() }
    const a = answers.value[name]
    if (a instanceof Error) return { data: undefined, error: a, refetch: vi.fn() }
    return { data: typeof a === 'function' ? (a as (x: unknown) => unknown)(args) : a, error: null, refetch: vi.fn() }
  },
  useAction: (name: string) => (actions[name] ??= vi.fn()),
  getBranchChanges: 'getBranchChanges', getBranchCommits: 'getBranchCommits', getMainVersions: 'getMainVersions',
  getGitTree: 'getGitTree', getGitFile: 'getGitFile', getTaskConversation: taskConversation, getAgents: 'getAgents',
  mergeBranch: 'mergeBranch', restoreVersion: 'restoreVersion', turnGitOn: 'turnGitOn', bringBranchUpToDate: 'bringBranchUpToDate',
  getWorkspaceRefusal: 'getWorkspaceRefusal', listLocationFiles: 'listLocationFiles',
  getPlaceWorkflows: 'getPlaceWorkflows', startWorkflowRun: 'startWorkflowRun',
  getLivePreviewPlaces: 'getLivePreviewPlaces', getLivePreview: 'getLivePreview', markLivePreviewInUse: 'markLivePreviewInUse',
  getFeatures: 'getFeatures', getConversationInbox: 'getConversationInbox', getMainVersionAt: 'getMainVersionAt', getMainVersionChanges: 'getMainVersionChanges',
}))
vi.mock('../../storage/pages/OpenedFile', () => ({ OpenedFile: ({ path }: { path: string }) => <div>opened {path}</div> }))
vi.mock('../../storage/pages/FolderTree', () => ({ FolderTree: () => <div>workspace folder</div> }))
vi.mock('../../dock/DockPhoneButton', () => ({ DockPhoneButton: () => <button type="button">Chat</button> }))

import { WorkspaceViewBody } from '../components/WorkspaceViewBody'
import { CantOpenWorkspace } from '../components/CantOpen'
import { VIEWER_UPDATE } from '../words'

const workspace = { id: 'w1', name: 'shop-app', ownerType: 'project' as const, ownerId: 'p1' }
const login: BranchLineView = {
  id: 'b1', name: 'login-page', ahead: 6, behind: 0, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'conversation', conversationId: 'c1', title: 'Launch checklist', personId: 'u2', personName: 'Rae' }, working: null,
}
const cart: BranchLineView = {
  id: 'b2', name: 'fix-cart-total', ahead: 2, behind: 3, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'task', taskId: 't1', taskKey: 'SHOP-14', title: 'Fix the cart total', personId: null, personName: null }, working: null,
}
const mine: BranchLineView = {
  id: 'b3', name: 'refresh-footer', ahead: 1, behind: 0, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'conversation', conversationId: 'c3', title: 'Refresh the footer', personId: 'u1', personName: 'Sam Lee' }, working: null,
}
const codeView = (canAct = true, branches = [login, cart, mine]): WorkspaceBranchesView => ({ git: true, canAct, main: { name: 'main', head: 'h'.repeat(40), versionCount: 14 }, branches })
const V13 = 'd'.repeat(40)

function Where() {
  return <div data-testid="where">{useLocation().search}</div>
}

function dockValue(): DockValue {
  return { open: null, draft: null, width: 'wide', openConversation: vi.fn(), startNew: vi.fn(), close: vi.fn(), position: 'docked', setPosition: vi.fn() }
}

function show(view: WorkspaceBranchesView, at = '/workspaces/w1/view', dock = dockValue()) {
  const tree = (v: WorkspaceBranchesView) => (
    <DockContext.Provider value={dock}>
      <MemoryRouter initialEntries={[at]}>
        <WorkspaceViewBody workspace={workspace} view={v} userId="u1" back={{ href: '/projects/SHOP?tool=workspaces', label: 'Fernhill Shop' }}
          place={{ kind: 'project', key: 'SHOP' }} workspaces={[{ id: 'w1', name: 'shop-app' }, { id: 'w2', name: 'docs' }]} refetchBranches={vi.fn()} />
        <Where />
      </MemoryRouter>
    </DockContext.Provider>
  )
  const r = render(tree(view))
  return { ...r, dock, again: (v: WorkspaceBranchesView) => r.rerender(tree(v)) }
}

const where = () => screen.getByTestId('where').textContent ?? ''
const top = () => within(screen.getByTestId('workspace-top'))

beforeEach(() => {
  localStorage.clear()
  for (const k of Object.keys(actions)) delete actions[k]
  taskConversation.mockClear()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
  answers.value = {
    getBranchChanges: { base: 'h10', head: 'h20', overflow: false, baseVersion: 12, files: [
      { path: 'src/App.tsx', status: 'modified', from: null, additions: 3, deletions: 1 },
      { path: 'src/pages/Login.tsx', status: 'added', from: null, additions: 9, deletions: 0 },
    ] },
    getGitTree: { exists: true, overflow: false, entries: [{ name: 'README.md', path: 'README.md', kind: 'file', bytes: 10 }] },
    getGitFile: { exists: true, binary: false, tooLarge: false, bytes: 5, text: 'one\n' },
    getMainVersions: { hasMore: false, versions: [
      { number: 14, commit: 'h'.repeat(40), subject: 'Login page', author: { name: 'Mia', email: 'm@x' }, files: 3, at: new Date().toISOString() },
      { number: 13, commit: V13, subject: 'Fix footer links', author: { name: 'Kernel', email: 'k@x' }, files: 1, at: new Date().toISOString() },
    ] },
    getAgents: [],
    getPlaceWorkflows: { workflows: [], mayRun: true, mayAdminister: false },
    getFeatures: featuresAnswer,
    getConversationInbox: { conversations: [], waiting: 0, needsYou: 0 },
    getMainVersionChanges: null,
    getMainVersionAt: (a: { version: string }) => (a.version === 'v13' ? { number: 13, commit: V13, latest: false } : { number: 14, commit: 'h'.repeat(40), latest: true }),
  }
})

describe('the breadcrumb @SC-1929', () => {
  it('on a branch: the branch ▾ and 💬 Chat, which opens the conversation it came from, and nothing else does', () => {
    const { dock } = show(codeView(), '/workspaces/w1/view?branch=refresh-footer')
    expect(top().getByRole('button', { name: 'Branch: refresh-footer' })).toBeTruthy()
    expect(top().queryByRole('button', { name: /^Version/ })).toBeNull()
    expect(dock.openConversation).not.toHaveBeenCalled()
    fireEvent.click(top().getByRole('button', { name: 'Chat' }))
    expect(dock.openConversation).toHaveBeenCalledWith('c3', null)
    expect(screen.queryByTestId('workspace-conversation')).toBeNull()
    expect(screen.queryByText(/main has no conversation/)).toBeNull()
  })

  it("a task's branch opens the task's conversation, or starts it in the chat panel when it has none", async () => {
    const { dock } = show(codeView(), '/workspaces/w1/view?branch=fix-cart-total')
    fireEvent.click(top().getByRole('button', { name: 'Chat' }))
    await waitFor(() => expect(dock.startNew).toHaveBeenCalledWith({ kind: 'project', key: 'SHOP' }, null, { taskId: 't1', taskKey: 'SHOP-14', agentName: 'Kernel' }))
    taskConversation.mockResolvedValueOnce({ conversation: { id: 'tc1' } })
    fireEvent.click(top().getByRole('button', { name: 'Chat' }))
    await waitFor(() => expect(dock.openConversation).toHaveBeenCalledWith('tc1', null))
  })

  it("the branch menu gives each branch one line: where it came from, whose, its changes, how far behind main", () => {
    const { dock } = show(codeView(), '/workspaces/w1/view?branch=refresh-footer')
    fireEvent.click(top().getByRole('button', { name: 'Branch: refresh-footer' }))
    const list = within(screen.getByTestId('branch-list'))
    expect(list.getByText('Protected · version 14')).toBeTruthy()
    expect(list.getByText('You · 2 changes')).toBeTruthy()
    expect(list.getByText('3 behind main')).toBeTruthy()
    fireEvent.click(list.getByRole('button', { name: /came from: task SHOP-14/ }))
    expect(taskConversation).toHaveBeenCalledWith({ taskId: 't1' })
    fireEvent.click(top().getByRole('button', { name: 'Branch: refresh-footer' }))
    fireEvent.click(within(screen.getByTestId('branch-list')).getByRole('button', { name: /Open the chat refresh-footer came from/ }))
    expect(dock.openConversation).toHaveBeenCalledWith('c3', null)
  })

  it("someone else's conversation is named, not linked: no link in the menu and a disabled 💬 Rae's chat that says why", () => {
    const { dock } = show(codeView(), '/workspaces/w1/view?branch=login-page')
    fireEvent.click(top().getByRole('button', { name: 'Branch: login-page' }))
    const list = within(screen.getByTestId('branch-list'))
    expect(list.queryByRole('button', { name: /Open the chat login-page came from/ })).toBeNull()
    expect(list.getByTestId('branch-origin-text').textContent).toBe("Rae's conversation, Launch checklist")
    expect(list.getByText('2 changes')).toBeTruthy()
    expect(list.queryByText(/^Rae · /)).toBeNull()
    // Their name is in the origin, not said a second time; a task's branch and one's own stay links.
    expect(list.getAllByRole('button', { name: /^Open the chat .* came from/ })).toHaveLength(2)
    fireEvent.click(top().getByRole('button', { name: 'Branch: login-page' }))
    const chat = top().getByRole('button', { name: /^Rae's chat/ })
    expect(chat.getAttribute('aria-disabled')).toBe('true')
    expect(chat.getAttribute('title')).toBe("Only Rae can talk to this branch's agent. To change this workspace yourself, ask in any of your conversations; it gets a branch of its own.")
    fireEvent.click(chat)
    expect(dock.openConversation).not.toHaveBeenCalled()
    expect(top().queryByRole('button', { name: 'Chat' })).toBeNull()
  })

  it("on main: the version ▾; an older one is read-only, with Back to latest and Return main to it…", async () => {
    show(codeView())
    fireEvent.click(top().getByRole('button', { name: 'Version: v14 · latest' }))
    fireEvent.click(within(screen.getByTestId('version-list')).getByText('Fix footer links'))
    expect(where()).toContain('version=v13')
    expect(top().getByRole('button', { name: 'Version: v13' })).toBeTruthy()
    fireEvent.click(top().getByRole('button', { name: 'Return main to v13…' }))
    actions.restoreVersion.mockImplementation(async () => ({ outcome: 'restored', versionNumber: 15 }))
    fireEvent.click(within(screen.getByTestId('return-main-dialog')).getByRole('button', { name: 'Make v13 main again' }))
    await waitFor(() => expect(actions.restoreVersion).toHaveBeenCalledWith({ workspaceId: 'w1', versionCommit: V13, expectedMain: 'h'.repeat(40) }))
    await waitFor(() => expect(where()).not.toContain('version='))
  })

  it('Back to latest leaves the older version; a Viewer gets no Return', () => {
    show(codeView(false), '/workspaces/w1/view?version=v13')
    expect(top().queryByRole('button', { name: /Return main/ })).toBeNull()
    fireEvent.click(top().getByRole('button', { name: 'Back to latest' }))
    expect(where()).not.toContain('version=')
  })
})

describe('the next-step button', () => {
  it('Merge into main… opens a dialog whose button names the branch; a clash ends with Bring up to date', async () => {
    show(codeView(), '/workspaces/w1/view?branch=login-page')
    fireEvent.click(top().getByRole('button', { name: 'Merge into main…' }))
    actions.mergeBranch.mockImplementation(async () => ({ outcome: 'clash', agentAsked: false, clashes: [{ path: 'src/App.tsx', version: null }] }))
    fireEvent.click(within(screen.getByTestId('merge-dialog')).getByRole('button', { name: 'Merge login-page into main' }))
    const dialog = within(await screen.findByTestId('merge-dialog'))
    await waitFor(() => expect(dialog.getByText('Nothing was merged')).toBeTruthy())
    expect(dialog.getByText('src/App.tsx')).toBeTruthy()
    expect(top().getByRole('button', { name: 'Bring up to date' })).toBeTruthy()
    actions.bringBranchUpToDate.mockImplementation(async () => ({ asked: true }))
    fireEvent.click(dialog.getByRole('button', { name: 'Bring up to date' }))
    await waitFor(() => expect(actions.bringBranchUpToDate).toHaveBeenCalledWith({ branchId: 'b1' }))
    expect(top().getByRole('button', { name: 'Updating…' })).toBeTruthy()
    expect(screen.queryByTestId('merge-dialog')).toBeNull()
  })

  it('a branch behind main says Bring up to date, why on hover, then Updating… until its agent has worked and stopped', async () => {
    const { again } = show(codeView(), '/workspaces/w1/view?branch=fix-cart-total')
    const button = top().getByRole('button', { name: 'Bring up to date' })
    expect(button.getAttribute('title')).toBe('main has 3 newer versions. Kernel brings them into this branch, then you can merge.')
    actions.bringBranchUpToDate.mockImplementation(async () => ({ asked: true }))
    fireEvent.click(button)
    await waitFor(() => expect(top().getByRole('button', { name: 'Updating…' })).toBeTruthy())
    expect(top().getByLabelText('Updating')).toBeTruthy()
    again(codeView(true, [login, { ...cart, working: { agentName: 'Kernel' } }]))
    expect(top().getByRole('button', { name: 'Updating…' })).toBeTruthy()
    again(codeView(true, [login, { ...cart, behind: 0, working: null }]))
    expect(top().getByRole('button', { name: 'Merge into main…' })).toBeTruthy()
  })

  it('says what is wrong when the agent could not be asked, and goes back to Bring up to date', async () => {
    show(codeView(), '/workspaces/w1/view?branch=fix-cart-total')
    actions.bringBranchUpToDate.mockImplementation(async () => { throw new Error("fix-cart-total's agent could not be asked. Nothing was changed.") })
    fireEvent.click(top().getByRole('button', { name: 'Bring up to date' }))
    expect((await screen.findByRole('alert')).textContent).toContain('could not be asked')
    expect(top().getByRole('button', { name: 'Bring up to date' })).toBeTruthy()
  })

  it('a Viewer sees no button; the branch menu says who can update it', () => {
    show(codeView(false), '/workspaces/w1/view?branch=fix-cart-total')
    expect(top().queryByRole('button', { name: /Bring up to date|Merge into main/ })).toBeNull()
    fireEvent.click(top().getByRole('button', { name: 'Branch: fix-cart-total' }))
    expect(screen.getByText(VIEWER_UPDATE)).toBeTruthy()
  })

  it('without Git: Keep versions with Git… says first it cannot be undone, names the workspace, then a short note', async () => {
    const { again } = show({ git: false, canAct: true })
    expect(top().queryByRole('button', { name: /^Branch/ })).toBeNull()
    fireEvent.click(top().getByRole('button', { name: 'Keep versions with Git…' }))
    const dialog = within(screen.getByTestId('turn-git-on'))
    expect(dialog.getByRole('note').textContent).toContain("This can't be undone.")
    actions.turnGitOn.mockImplementation(async () => ({ versionNumber: 1, leftOut: [], gitignoreAdded: true }))
    fireEvent.click(dialog.getByRole('button', { name: 'Turn on Git for shop-app' }))
    await waitFor(() => expect(actions.turnGitOn).toHaveBeenCalledWith({ workspaceId: 'w1' }))
    again(codeView(true, []))
    // The screen shows Git is on (branches, versions): nothing more is said when no file was left out.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByTestId('git-on-note')).toBeNull()
  })
})

describe('About', () => {
  it("says where the branch came from and how far it is from main, and holds Deploy…", () => {
    show(codeView(), '/workspaces/w1/view?branch=fix-cart-total')
    fireEvent.click(top().getByRole('button', { name: 'About' }))
    const about = within(screen.getByTestId('view-about'))
    expect(about.getByText(/came from task SHOP-14/).textContent).toContain('3 behind main')
    fireEvent.click(about.getByRole('button', { name: 'Deploy…' }))
    expect(screen.getByTestId('deploy-none')).toBeTruthy()
    expect(about.getByRole('link', { name: 'Repository, site and tools' }).getAttribute('href')).toBe('/projects/SHOP?tool=workspaces&workspace=w1&wabout=1')
  })
})

describe('on a phone', () => {
  beforeEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 }) })

  it('the title is the workspace, the branch under it opens the branch sheet, and the next step is at the foot', () => {
    show(codeView(), '/workspaces/w1/view?branch=login-page')
    expect(screen.getByTestId('workspace-view').getAttribute('data-size')).toBe('phone')
    expect(within(screen.getByTestId('phone-foot')).getByRole('button', { name: 'Merge into main…' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Branch: login-page' }))
    expect(within(screen.getByRole('dialog', { name: 'Branches' })).getByTestId('branch-list')).toBeTruthy()
  })

  it("⋮ shows someone else's conversation's chat disabled, with why, not as a way in", () => {
    const { dock } = show(codeView(), '/workspaces/w1/view?branch=login-page')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const menu = within(screen.getByRole('dialog', { name: 'shop-app' }))
    expect(menu.queryByRole('button', { name: 'Open this branch’s chat' })).toBeNull()
    const chat = menu.getByRole('button', { name: "Rae's chat" })
    expect(chat.getAttribute('aria-disabled')).toBe('true')
    expect(menu.getByText(/Only Rae can talk to this branch's agent\./)).toBeTruthy()
    fireEvent.click(chat)
    expect(dock.openConversation).not.toHaveBeenCalled()
  })

  it('⋮ holds the branch’s chat, switching workspace and About', () => {
    const { dock } = show(codeView(), '/workspaces/w1/view?branch=refresh-footer')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const menu = within(screen.getByRole('dialog', { name: 'shop-app' }))
    fireEvent.click(menu.getByRole('button', { name: /Switch workspace/ }))
    expect(within(screen.getByRole('dialog', { name: 'Switch workspace' })).getByRole('menuitem', { name: 'docs' }).getAttribute('href')).toBe('/workspaces/w2/view')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the menu' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'shop-app' })).getByRole('button', { name: 'Open this branch’s chat' }))
    expect(dock.openConversation).toHaveBeenCalledWith('c3', null)
  })

  it('on main the line is main and its version, which opens the versions; an older one says read-only and offers the way back', () => {
    show(codeView(), '/workspaces/w1/view?version=v13')
    const line = screen.getByRole('button', { name: /^Version: main/ })
    expect(line.textContent).toContain('read-only')
    fireEvent.click(line)
    expect(within(screen.getByRole('dialog', { name: 'Versions of main' })).getByTestId('version-list')).toBeTruthy()
    expect(within(screen.getByTestId('phone-foot')).getByRole('button', { name: 'Back to latest' })).toBeTruthy()
  })
})

describe("a workspace that can't be opened", () => {
  const page = () => render(<MemoryRouter><CantOpenWorkspace workspaceId="w9" /></MemoryRouter>)

  it('names a project the person may see, says who can fix it, and links back', () => {
    answers.value = { getWorkspaceRefusal: { reason: 'no_access', project: { name: 'Website relaunch', key: 'WEB' } } }
    page()
    expect(screen.getByRole('heading', { name: "You can't open this workspace" })).toBeTruthy()
    expect(screen.getByText(/Ask an admin of the project to add you. Nothing was changed./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Website relaunch' }).getAttribute('href')).toBe('/projects/WEB')
    expect(screen.getByRole('button', { name: 'Copy this link' })).toBeTruthy()
  })

  it('names no project the person may not see, and offers Home', () => {
    answers.value = { getWorkspaceRefusal: { reason: 'no_access', project: null } }
    page()
    expect(screen.queryByText(/Website relaunch/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to Home' }).getAttribute('href')).toBe('/')
  })

  it('says a workspace that is gone is not here any more', () => {
    answers.value = { getWorkspaceRefusal: { reason: 'gone' } }
    page()
    expect(screen.getByRole('heading', { name: "This workspace isn't here any more" })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Home' })).toBeTruthy()
  })

  it('says so when the reason cannot be read, instead of loading for ever', () => {
    answers.value = { getWorkspaceRefusal: new Error('The site holding this workspace is not answering.') }
    page()
    expect(screen.getByRole('heading', { name: "This workspace can't be opened right now" })).toBeTruthy()
  })
})
