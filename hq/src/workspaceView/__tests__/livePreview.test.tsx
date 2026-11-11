// @vitest-environment jsdom
/**
 * The workspace view's *Live preview* (live preview spec, part 4, and part 5's site choice), against the live-preview
 * operations' types with their answers given here.
 */
import { withFeature } from '@agenthix/core/testing'
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { BranchLineView, WorkspaceBranchesView } from '../../branches/views'
import type { LivePreviewPlaces, LivePreviewView } from '../../livePreviews/types'

const answers = vi.hoisted(() => ({ value: {} as Record<string, unknown>, readAt: {} as Record<string, number> }))
const actions = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>))
// The person's foot and its phone rows have their own tests (viewFoot.test.tsx).
vi.mock('../components/PhonePersonRows', () => ({ PhonePersonRows: () => null }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (name: string, args: unknown, opts?: { enabled?: boolean }) => {
    if (opts?.enabled === false) return { data: undefined, error: null, refetch: vi.fn() }
    const a = answers.value[name]
    return { data: typeof a === 'function' ? (a as (x: unknown) => unknown)(args) : a, error: null, refetch: vi.fn(), dataUpdatedAt: answers.readAt[name] ?? 0 }
  },
  useAction: (name: string) => (actions[name] ??= vi.fn().mockResolvedValue(undefined)),
  getBranchChanges: 'getBranchChanges', getMainVersionAt: 'getMainVersionAt', getMainVersionChanges: 'getMainVersionChanges', getBranchCommits: 'getBranchCommits', getMainVersions: 'getMainVersions',
  getGitTree: 'getGitTree', getGitFile: 'getGitFile', getTaskConversation: 'getTaskConversation', getAgents: 'getAgents',
  mergeBranch: 'mergeBranch', bringBranchUpToDate: 'bringBranchUpToDate', getWorkspaceRefusal: 'getWorkspaceRefusal', restoreVersion: 'restoreVersion', turnGitOn: 'turnGitOn',
  markConversationRead: vi.fn(), listLocationFiles: 'listLocationFiles',
  getPlaceWorkflows: 'getPlaceWorkflows', startWorkflowRun: 'startWorkflowRun', startTaskConversation: 'startTaskConversation',
  getLivePreviewPlaces: 'getLivePreviewPlaces', getLivePreview: 'getLivePreview', markLivePreviewInUse: 'markLivePreviewInUse',
  startLivePreview: 'startLivePreview', stopLivePreview: 'stopLivePreview', resumeLivePreview: 'resumeLivePreview',
  reloadLivePreview: 'reloadLivePreview', setLivePreviewAuto: 'setLivePreviewAuto', openLiveApp: 'openLiveApp',
  answerLivePreviewQuestion: 'answerLivePreviewQuestion', runLivePreviewWorkflow: 'runLivePreviewWorkflow',
  startLiveApp: 'startLiveApp', stopLiveApp: 'stopLiveApp', restartLiveApp: 'restartLiveApp',
  getFeatures: 'getFeatures',
}))
vi.mock('../../conversations/components/ConversationThread', () => ({
  ConversationThread: ({ conversationId }: { conversationId: string }) => <div>thread {conversationId}</div>,
}))
vi.mock('../../storage/pages/FolderTree', () => ({ FolderTree: () => <div>workspace folder</div> }))

import { WorkspaceViewBody } from '../components/WorkspaceViewBody'
import { featuresAnswer } from '../../test/featuresAnswer'
import { WorkspaceEventContext, type WorkspaceViewEvent } from '../hooks/useWorkspaceLive'

const workspace = { id: 'w1', name: 'shop-app', ownerType: 'project' as const, ownerId: 'p1' }
const login: BranchLineView = {
  id: 'b1', name: 'login-page', ahead: 6, behind: 0, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'conversation', conversationId: 'c1', title: 'Login page', personId: 'u1', personName: 'Mia' }, working: null,
}
const codeView = (canAct = true): WorkspaceBranchesView => ({ git: true, canAct, main: { name: 'main', head: 'h14', versionCount: 14 }, branches: [login] })
const site = { executionSiteId: 'es1', name: 'preview-box', open: 2, limit: 6 }
const places = (over: Partial<LivePreviewPlaces> = {}): LivePreviewPlaces => ({
  current: null, mayStart: true, blocked: null, needsGit: false, picked: site,
  others: [{ executionSiteId: 'es2', name: 'lab', open: 0, limit: null, blocked: null, full: false }], full: null, lastStopped: null, ...over,
})
const running = (over: Partial<LivePreviewView> = {}): LivePreviewView => ({
  livePreviewId: 'lp1', workspaceId: 'w1', branchId: 'b1', branch: 'login-page', onMain: false, state: 'running', reason: null,
  detail: null, since: new Date().toISOString(), site, startedBy: { id: 'u1', name: 'Mia' }, yours: true, mayStop: true,
  mayResume: false, autoReload: true, openedAt: new Date().toISOString(), lastUsedAt: new Date().toISOString(),
  apps: [{ appId: 'a7f3a', name: 'web', folder: '', command: 'npm run dev', port: 5173, state: 'running', since: new Date().toISOString(), detail: null, lastLines: [], address: 'https://p-7f3a.preview.example.com' }],
  startable: [], services: [], questions: [], workflows: { start: false, reload: false }, secrets: null, ...over,
})
const form = { action: 'https://p-7f3a.preview.example.com/__relay/enter', field: 'ticket', ticket: 't1', origin: 'https://p-7f3a.preview.example.com', target: 'frame', expiresAt: Date.now() + 15 * 60_000 }

function show(view: WorkspaceBranchesView, at = '/workspaces/w1/view?branch=login-page&section=preview', event: WorkspaceViewEvent | null = null) {
  const tree = (e: WorkspaceViewEvent | null) => (
    <MemoryRouter initialEntries={[at]}>
      <WorkspaceEventContext.Provider value={e}>
        <WorkspaceViewBody workspace={workspace} view={view} userId="u1" back={{ href: '/projects/SHOP?tool=workspaces', label: 'Fernhill Shop' }}
          workspaces={[{ id: 'w1', name: 'shop-app' }]} place={{ kind: "project", key: "SHOP" }} refetchBranches={vi.fn()} />
      </WorkspaceEventContext.Provider>
    </MemoryRouter>
  )
  const r = render(tree(event))
  return { ...r, again: (e: WorkspaceViewEvent) => r.rerender(tree(e)) }
}

/** A refused control's reason: its accessible description, which its tooltip and its dialog repeat. */
const reasonOf = (el: HTMLElement) => document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent

let submitted: HTMLFormElement[] = []
beforeEach(() => {
  localStorage.clear()
  for (const k of Object.keys(actions)) delete actions[k]
  submitted = []
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) { submitted.push(this.cloneNode(true) as HTMLFormElement) })
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
  answers.readAt = {}
  answers.value = { getTaskConversation: { conversation: { id: 'tc1' }, lead: null, canStart: false, refusal: null }, getAgents: [], getLivePreviewPlaces: places(), getFeatures: featuresAnswer }
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

withFeature('livePreview', () => {
describe('Live preview, before one runs @SC-1696', () => {
  it('says why the branch\'s last live preview stopped, though this screen did not see it stop', () => {
    answers.value.getLivePreviewPlaces = places({
      lastStopped: { reason: 'idle', detail: 'Nobody had it open and no agent was working on its branch, so it stopped.', at: new Date().toISOString() },
    })
    show(codeView())
    expect(screen.getByTestId('live-preview-last-stopped').textContent).toContain('Nobody had it open')
  })

  it('says where HQ would start it and how full that site is, and starts it there', async () => {
    actions.startLivePreview = vi.fn().mockResolvedValue(running())
    show(codeView())
    expect(screen.getByRole('button', { name: /Live preview · Stopped/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Runs on preview-box · 2 of 6 open.')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Start live preview/ })) })
    expect(actions.startLivePreview).toHaveBeenCalledWith({ workspaceId: 'w1', branchId: 'b1', executionSiteId: 'es1' })
  })

  it('follows HQ after starting: one that stopped meanwhile shows why, never Starting', async () => {
    actions.startLivePreview = vi.fn().mockResolvedValue(running({ state: 'starting', apps: [] }))
    const { rerender, container } = show(codeView())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Start live preview/ })) })
    expect(container.textContent).toContain('Starting the live preview')
    answers.readAt.getLivePreviewPlaces = Date.now() + 1
    answers.value.getLivePreviewPlaces = places({
      lastStopped: { reason: 'person', detail: 'Mia stopped it.', at: new Date().toISOString() },
    })
    rerender(
      <MemoryRouter initialEntries={['/workspaces/w1/view?branch=login-page&section=preview']}>
        <WorkspaceEventContext.Provider value={null}>
          <WorkspaceViewBody workspace={workspace} view={codeView()} userId="u1" back={{ href: '/projects/SHOP?tool=workspaces', label: 'Fernhill Shop' }}
            workspaces={[{ id: 'w1', name: 'shop-app' }]} place={{ kind: "project", key: "SHOP" }} refetchBranches={vi.fn()} />
        </WorkspaceEventContext.Provider>
      </MemoryRouter>,
    )
    expect(container.textContent).not.toContain('Starting the live preview')
    expect(screen.getByTestId('live-preview-last-stopped').textContent).toContain('Mia stopped it.')
  })

  it('lets the person pick another allowed site with room', async () => {
    actions.startLivePreview = vi.fn().mockResolvedValue(running())
    show(codeView())
    fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'es2' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Start live preview/ })) })
    expect(actions.startLivePreview).toHaveBeenCalledWith({ workspaceId: 'w1', branchId: 'b1', executionSiteId: 'es2' })
  })

  it('turns Git on first when the workspace has none', async () => {
    answers.value.getLivePreviewPlaces = places({ needsGit: true, picked: null, others: [] })
    const order: string[] = []
    actions.turnGitOn = vi.fn(async () => { order.push('git'); return { versionNumber: 1, leftOut: [] } })
    actions.startLivePreview = vi.fn(async () => { order.push('start'); return running() })
    show(codeView())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Turn Git on and start/ })) })
    expect(order).toEqual(['git', 'start'])
  })

  it('on a full site lists the open ones, whose and which branch, with Stop on those the person may stop', async () => {
    answers.value.getLivePreviewPlaces = places({
      picked: null, others: [],
      full: { site: { ...site, open: 6 }, open: [
        { livePreviewId: 'lpA', workspaceName: 'shop-app', branch: 'cart', person: { id: 'u1', name: 'Mia' }, lastUsedAt: new Date().toISOString(), mayStop: true },
        { livePreviewId: 'lpB', workspaceName: 'Another place', branch: '', person: { id: 'u2', name: 'Kai' }, lastUsedAt: new Date().toISOString(), mayStop: false },
      ] },
    })
    show(codeView())
    const list = screen.getByRole('region', { name: 'Open live previews' })
    expect(within(list).getByText('preview-box has 6 of 6 open')).toBeTruthy()
    expect(within(list).getAllByRole('button', { name: 'Stop' })).toHaveLength(1)
    await act(async () => { fireEvent.click(within(list).getByRole('button', { name: 'Stop' })) })
    expect(actions.stopLivePreview).toHaveBeenCalledWith({ livePreviewId: 'lpA' })
  })

  it('shows why none can start, and a refusal as HQ worded it', async () => {
    answers.value.getLivePreviewPlaces = places({ blocked: 'No site runs live previews now. A fleet admin turns them on for a site in the Fleet Console.', picked: null, others: [] })
    show(codeView())
    const start = screen.getByRole('button', { name: /Start live preview/ })
    expect(start.getAttribute('aria-disabled')).toBe('true')
    expect(reasonOf(start)).toMatch(/A fleet admin turns them on/)
    await act(async () => { fireEvent.click(start) })
    expect(actions.startLivePreview).not.toHaveBeenCalled()
    expect(screen.getByTestId('attention-text').textContent).toMatch(/A fleet admin turns them on/)
  })

  it('on an installation reached by a network address, says a domain is needed and offers no site @SC-1719', () => {
    const words = "Live previews need a domain: this HQ is reached by a network address, and each app needs a name of its own. A fleet admin gives HQ a domain and a preview address in the Fleet Console, on HQ's relay. Nothing was changed."
    answers.value.getLivePreviewPlaces = places({ blocked: words, picked: null, others: [] })
    show(codeView())
    const start = screen.getByRole('button', { name: /Start live preview/ })
    expect(start.getAttribute('aria-disabled')).toBe('true')
    expect(reasonOf(start)).toBe(words)
    expect(screen.queryByText('preview-box')).toBeNull()
  })

  it('a Viewer sees it but cannot start one', () => {
    answers.value.getLivePreviewPlaces = places({ mayStart: false })
    show(codeView(false))
    const start = screen.getByRole('button', { name: /Start live preview/ })
    expect(start.getAttribute('aria-disabled')).toBe('true')
    expect(reasonOf(start)).toMatch(/needs a Member or Admin/)
  })
})
})

withFeature('livePreview', () => {
describe('Live preview, running', () => {
  beforeEach(() => {
    answers.value.getLivePreviewPlaces = places({ current: running() })
    answers.value.getLivePreview = running()
    actions.openLiveApp = vi.fn().mockResolvedValue(form)
  })

  it('narrows the panel to its strip and keeps its own bar: state, address, New tab, the site and how full @SC-1697', async () => {
    show(codeView())
    expect(screen.getByTestId('workspace-strip')).toBeTruthy()
    const bar = screen.getByTestId('live-preview-bar')
    expect(within(bar).getByText('Running')).toBeTruthy()
    expect(within(bar).getByTestId('live-preview-address').textContent).toBe('https://p-7f3a.preview.example.com')
    expect(within(bar).getByTestId('live-preview-site').textContent).toBe('preview-box · 2 of 6 open')
    expect(within(bar).getByText('Started by you')).toBeTruthy()
    expect(within(bar).getByRole('button', { name: /New tab/ })).toBeTruthy()
    await waitFor(() => expect(submitted).toHaveLength(1))
  })

  it('enters the app in the frame by a form post, never a link, and tells HQ it is in use @SC-1697 @SC-1699', async () => {
    show(codeView())
    await waitFor(() => expect(submitted).toHaveLength(1))
    expect(actions.openLiveApp).toHaveBeenCalledWith({ livePreviewId: 'lp1', appId: 'a7f3a', entry: 'frame' })
    const posted = submitted[0]
    expect(posted.method).toBe('post')
    expect(posted.target).toBe('live-app-a7f3a')
    expect((posted.querySelector('input[name=ticket]') as HTMLInputElement).value).toBe('t1')
    const frame = screen.getByTestId('live-app-frame')
    expect(frame.getAttribute('src')).toBeNull()
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms allow-downloads')
    await waitFor(() => expect(actions.markLivePreviewInUse).toHaveBeenCalledWith({ livePreviewId: 'lp1' }))
  })

  it('reloads for everyone when the agent asks, and with Auto on when the branch gets commits @SC-1698', async () => {
    const { again } = show(codeView())
    await waitFor(() => expect(submitted).toHaveLength(1))
    again({ seq: 1, kind: 'reload', event: { workspaceId: 'w1', livePreviewId: 'lp1', kind: 'reload', by: 'Kernel' } })
    await waitFor(() => expect(submitted).toHaveLength(2))
    again({ seq: 2, kind: 'commits', branchId: 'b1' })
    await waitFor(() => expect(submitted).toHaveLength(3))
    again({ seq: 3, kind: 'commits', branchId: 'other' })
    await new Promise(r => setTimeout(r, 20))
    expect(submitted).toHaveLength(3)
  })

  it('Stop, Auto and Reload ask HQ @SC-1698', async () => {
    show(codeView())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop' })) })
    expect(actions.stopLivePreview).toHaveBeenCalledWith({ livePreviewId: 'lp1' })
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /Auto/ })) })
    expect(actions.setLivePreviewAuto).toHaveBeenCalledWith({ livePreviewId: 'lp1', auto: false })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reload' })) })
    expect(actions.reloadLivePreview).toHaveBeenCalledWith({ livePreviewId: 'lp1' })
  })

  it('a Viewer sees the app but cannot reload it or switch Auto @SC-1698', async () => {
    show(codeView(false))
    await waitFor(() => expect(submitted).toHaveLength(1))
    expect((screen.getByRole('button', { name: 'Reload' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Auto/ }) as HTMLInputElement).disabled).toBe(true)
  })

  it('asks for a yes to a new service or a blocked install script, worded by HQ @SC-1709', async () => {
    const q = running({ questions: [
      { kind: 'service.start', service: 'db', declaration: 'f'.repeat(64), image: 'postgres:16', question: 'The app wants to run the service db (postgres:16) beside it. Start it?' },
      { kind: 'package.use', ecosystem: 'npm', name: 'esbuild', version: '0.24.0', question: 'esbuild 0.24.0 runs code when installed. Let it?' },
    ], services: [{ name: 'db', state: 'waiting', declarationHash: 'f'.repeat(64), declaration: { image: 'postgres:16' } as never, detail: null }] })
    answers.value.getLivePreview = q
    answers.value.getLivePreviewPlaces = places({ current: q })
    show(codeView())
    const asks = screen.getByRole('region', { name: 'Waiting for your yes' })
    await act(async () => { fireEvent.click(within(asks).getByRole('button', { name: 'Allow' })) })
    expect(actions.answerLivePreviewQuestion).toHaveBeenCalledWith({ livePreviewId: 'lp1', request: { kind: 'package.use', ecosystem: 'npm', name: 'esbuild', version: '0.24.0' } })
    await act(async () => { fireEvent.click(within(asks).getByRole('button', { name: 'Start it' })) })
    expect(actions.answerLivePreviewQuestion).toHaveBeenCalledWith({ livePreviewId: 'lp1', request: { kind: 'service.start', service: 'db', declaration: 'f'.repeat(64) } })
    expect(screen.getByTestId('live-preview-service').textContent).toContain('Waiting for a yes')
  })

  it('offers no workflow with secrets when the place has none approved and switched on @SC-1712', () => {
    const lp = running()
    answers.value.getLivePreview = lp
    answers.value.getLivePreviewPlaces = places({ current: lp })
    show(codeView())
    expect(screen.queryByRole('button', { name: 'Start with secrets' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reload with secrets' })).toBeNull()
  })

  it('runs the start workflow with secrets when the place has it, and shows HQ\'s refusal @SC-1712', async () => {
    const lp = running({ workflows: { start: true, reload: false } })
    answers.value.getLivePreview = lp
    answers.value.getLivePreviewPlaces = places({ current: lp })
    actions.runLivePreviewWorkflow = vi.fn().mockRejectedValue(Object.assign(new Error('start-live-preview is switched off. A person who administers this place switches it on in Workflows. Nothing was changed.'), { data: { code: 'switchedOff' } }))
    show(codeView())
    expect(screen.queryByRole('button', { name: 'Reload with secrets' })).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start with secrets' })) })
    expect(actions.runLivePreviewWorkflow).toHaveBeenCalledWith({ livePreviewId: 'lp1', kind: 'start' })
    expect(screen.getByRole('alert').textContent).toMatch(/is switched off/)
  })

  it('offers Start for an app last started on another branch, as it was started, and shows it once started @SC-1703', async () => {
    const lp = running({ apps: [], startable: [{ name: 'shop', folder: 'web', command: 'npm run dev', port: 3000, fromBranch: 'shop-1' }] })
    answers.value.getLivePreview = lp
    answers.value.getLivePreviewPlaces = places({ current: lp })
    actions.startLiveApp = vi.fn().mockResolvedValue({ appId: 'a-new' })
    show(codeView())
    expect(screen.getByText('No app is running yet. Start one:')).toBeTruthy()
    const start = screen.getByRole('button', { name: /Start\s*shop/ })
    expect(start.getAttribute('title')).toBe('npm run dev in web, on port 3000, as last started on shop-1')
    await act(async () => { fireEvent.click(start) })
    expect(actions.startLiveApp).toHaveBeenCalledWith({ livePreviewId: 'lp1', name: 'shop' })
    // The app's own chip says it is starting, once HQ shows it: no line says so meanwhile.
    expect(screen.queryByText('shop is starting.')).toBeNull()
  })

  it('says why an app did not start, in HQ\'s words @SC-1703', async () => {
    const lp = running({ apps: [], startable: [{ name: 'shop', folder: '', command: 'npm start', port: 3000, fromBranch: null }] })
    answers.value.getLivePreview = lp
    answers.value.getLivePreviewPlaces = places({ current: lp })
    actions.startLiveApp = vi.fn().mockRejectedValue(new Error('This live preview is paused. Resume it first. Nothing was changed.'))
    show(codeView())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Start\s*shop/ })) })
    expect(screen.getByRole('alert').textContent).toMatch(/Resume it first/)
  })

  it('a Viewer is offered no Start @SC-1703', () => {
    const lp = running({ apps: [], startable: [{ name: 'shop', folder: '', command: 'npm start', port: 3000, fromBranch: null }] })
    answers.value.getLivePreview = lp
    answers.value.getLivePreviewPlaces = places({ current: lp, mayStart: false })
    show(codeView(false))
    expect(screen.queryByRole('button', { name: /Start\s*shop/ })).toBeNull()
  })

  it('a paused one says why, and offers Resume after a guard pause @SC-1714', async () => {
    const p = running({ state: 'paused', reason: 'guard', detail: 'The guard on preview-box found a port nobody opened and paused the live preview. Read what it found, then resume it.', mayResume: true })
    answers.value.getLivePreview = p
    answers.value.getLivePreviewPlaces = places({ current: p })
    show(codeView())
    // Why it paused is said by the state pill, on hover, not in a line over the preview.
    expect(screen.queryByText(/found a port nobody opened/)).toBeNull()
    fireEvent.mouseEnter(within(screen.getByTestId('live-preview-bar')).getByText('Paused'))
    expect(screen.getByTestId('tooltip').textContent).toMatch(/found a port nobody opened/)
    expect(screen.queryByTestId('live-app-frame')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Resume/ })) })
    expect(actions.resumeLivePreview).toHaveBeenCalledWith({ livePreviewId: 'lp1' })
  })

  it('on a tablet the live preview keeps its own bar, and the view draws no conversation drawer @SC-1697', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 })
    show(codeView())
    expect(screen.getByTestId('live-preview-bar')).toBeTruthy()
    expect(screen.queryByTestId('workspace-conversation')).toBeNull()
  })

  it('the branch select shows which branches have a live preview @SC-1684', () => {
    const view = { ...codeView(), branches: [{ ...login, livePreview: { livePreviewId: 'lp1', state: 'running' as const } }] }
    show(view)
    fireEvent.click(screen.getAllByRole('button', { name: /Branch: login-page/ })[0]!)
    expect(screen.getByTestId('branch-live-preview').textContent).toContain('Live preview running')
  })

  it('on a phone Live preview shows full width, with the bar and the app @SC-1697', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    show(codeView())
    expect(screen.getByTestId('live-preview-bar')).toBeTruthy()
    await waitFor(() => expect(submitted).toHaveLength(1))
  })
})
})
