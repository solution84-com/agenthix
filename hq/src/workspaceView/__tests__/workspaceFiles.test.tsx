// @vitest-environment jsdom
/**
 * Files and changes in one view (board *Files and changes, one view*, *On a phone*): one tree with the branch's changes
 * marked and *Only changed*, a file opened whole with its changes in place and ↑↓ between them, *Whole file* and
 * *Changes only*, and an older version of main read as it was, read-only.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import type { BranchLineView, BranchRef, WorkspaceBranchesView } from '../../branches/views'
import { featuresAnswer } from '../../test/featuresAnswer'

const answers = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
const asked = vi.hoisted(() => [] as { name: string; args: unknown }[])
// The person's foot and its phone rows have their own tests (viewFoot.test.tsx).
vi.mock('../components/PhonePersonRows', () => ({ PhonePersonRows: () => null }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (name: string, args: unknown, opts?: { enabled?: boolean }) => {
    if (opts?.enabled === false) return { data: undefined, error: null, refetch: vi.fn() }
    asked.push({ name, args })
    const a = answers.value[name]
    if (a instanceof Error) return { data: undefined, error: a, refetch: vi.fn() }
    return { data: typeof a === 'function' ? (a as (x: unknown) => unknown)(args) : a, error: null, refetch: vi.fn() }
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
vi.mock('../../conversations/components/ConversationThread', () => ({
  ConversationThread: ({ conversationId }: { conversationId: string }) => <div>thread {conversationId}</div>,
}))
vi.mock('../../storage/pages/OpenedFile', () => ({
  OpenedFile: ({ path, source }: { path: string; source?: { key: string } }) => <div data-key={source?.key}>opened {path}{source ? ' from git' : ' from the site'}</div>,
}))
vi.mock('../../storage/pages/FolderTree', () => ({ FolderTree: () => <div>workspace folder</div> }))

import { WorkspaceViewBody } from '../components/WorkspaceViewBody'

const workspace = { id: 'w1', name: 'website-code', ownerType: 'project' as const, ownerId: 'p1' }
const login: BranchLineView = {
  id: 'b1', name: 'login-page', ahead: 3, behind: 0, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'conversation', conversationId: 'c1', title: 'Login page', personId: 'u1', personName: 'Rae' }, working: null,
}
const codeView: WorkspaceBranchesView = { git: true, canAct: true, main: { name: 'main', head: 'h14', versionCount: 14 }, branches: [login] }
const C12 = 'c'.repeat(40)
const C11 = 'b'.repeat(40)

const entry = (path: string, kind: 'file' | 'dir' = 'file') => ({ name: path.split('/').pop()!, path, kind, bytes: kind === 'dir' ? null : 10 })
const TREE: Record<string, ReturnType<typeof entry>[]> = {
  '': [entry('docs', 'dir'), entry('public', 'dir'), entry('src', 'dir'), entry('README.md'), entry('package.json')],
  docs: [],
  public: [entry('public/logo.svg')],
  src: [entry('src/pages', 'dir'), entry('src/App.tsx'), entry('src/main.tsx')],
  'src/pages': [entry('src/pages/Home.tsx'), entry('src/pages/Login.tsx')],
}
const changes = {
  base: 'h11', head: 'h20', overflow: false, baseVersion: 11,
  files: [
    { path: 'src/App.tsx', status: 'modified', from: null, additions: 2, deletions: 2 },
    { path: 'src/pages/Login.tsx', status: 'added', from: null, additions: 3, deletions: 0 },
    { path: 'docs/old-notes.md', status: 'deleted', from: null, additions: 0, deletions: 2 },
  ],
}
const lines = (n: number, change: (i: number) => string | null = () => null) =>
  Array.from({ length: n }, (_, i) => change(i + 1) ?? `line ${i + 1}`).join('\n') + '\n'
// Two changes far apart in a 40-line file: line 5 and line 30.
const TEXT: Record<string, { base: string | null; tip: string | null }> = {
  'src/App.tsx': { base: lines(40), tip: lines(40, i => (i === 5 ? 'five, changed' : i === 30 ? 'thirty, changed' : null)) },
  'src/pages/Login.tsx': { base: null, tip: 'export function Login() {\n  return <form />\n}\n' },
  'docs/old-notes.md': { base: 'old\nnotes\n', tip: null },
}

function Where() {
  return <div data-testid="where">{useLocation().search}</div>
}

function show(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <WorkspaceViewBody workspace={workspace} view={codeView} userId="u1" back={{ href: '/projects/WEB?tool=workspaces', label: 'Website relaunch' }}
        workspaces={[{ id: 'w1', name: 'website-code' }]} place={{ kind: "project", key: "SHOP" }} refetchBranches={vi.fn()} />
      <Where />
    </MemoryRouter>,
  )
}

const tree = () => screen.getByTestId('files-tree')
const askedFor = (name: string) => asked.filter(a => a.name === name).map(a => a.args as Record<string, unknown>)

beforeEach(() => {
  localStorage.clear()
  asked.length = 0
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
  answers.value = {
    getFeatures: featuresAnswer,
    getBranchChanges: changes,
    getGitTree: (a: { path: string }) => ({ exists: true, overflow: false, entries: TREE[a.path] ?? [] }),
    getGitFile: (a: { at: 'tip' | 'base'; path: string; ref: BranchRef }) => {
      const t = a.path in TEXT ? TEXT[a.path][a.at] : `${a.path} as on ${a.ref.kind}\n`
      return t === null ? { exists: false } : { exists: true, binary: false, tooLarge: false, bytes: t.length, text: t }
    },
    getMainVersions: { hasMore: false, versions: [] },
    getMainVersionAt: { number: 12, commit: C12, latest: false },
    getMainVersionChanges: { base: C11, head: C12, overflow: false, files: [] },
    getTaskConversation: { conversation: null, lead: null, canStart: false, refusal: null },
    getAgents: [],
    getPlaceWorkflows: { workflows: [], mayRun: true, mayAdminister: false },
  }
})

describe('one tree, the branch’s changes marked @SC-1929', () => {
  it('opens with Only changed on: the changed files and the folders holding them, each marked, a deleted one still listed', () => {
    show('/workspaces/w1/view?branch=login-page')
    const only = screen.getByRole('button', { name: 'Only changed · 3' })
    expect(only.getAttribute('aria-pressed')).toBe('true')
    const t = tree()
    expect(within(t).getAllByRole('button').map(b => b.textContent)).toEqual(['docs', 'old-notes.md✕', 'src', 'pages', 'Login.tsxA', 'App.tsxM'])
    expect(within(t).getAllByRole('img', { name: 'holds changes' })).toHaveLength(3)
    expect(within(t).getByText('old-notes.md').className).toContain('line-through')
    expect(within(t).getByRole('img', { name: 'deleted' }).parentElement?.getAttribute('title')).toMatch(/still listed so it can be opened/)
    // Only changed reads the changes alone: no folder is listed.
    expect(askedFor('getGitTree').filter(a => a.path !== '')).toEqual([])
  })

  it('Only changed off shows the whole tree as on the branch, the folders with changes open and the rest closed', () => {
    show('/workspaces/w1/view?branch=login-page')
    fireEvent.click(screen.getByRole('button', { name: 'Only changed · 3' }))
    const names = within(tree()).getAllByRole('button').map(b => b.textContent)
    expect(names).toEqual(['docs', 'old-notes.md✕', 'public', 'src', 'pages', 'Home.tsx', 'Login.tsxA', 'App.tsxM', 'main.tsx', 'README.md', 'package.json'])
    expect(within(tree()).getByRole('button', { name: 'public' }).parentElement?.getAttribute('aria-expanded')).toBe('false')
    expect(askedFor('getGitTree').every(a => JSON.stringify(a.ref) === JSON.stringify({ kind: 'branch', branchId: 'b1' }))).toBe(true)
  })

  it('opens the folders of a file opened by its address and marks its row', () => {
    show('/workspaces/w1/view?file=src%2Fpages%2FHome.tsx')
    const row = within(tree()).getByRole('button', { name: 'Home.tsx' })
    expect(row.className).toContain('bg-selected')
    expect(within(tree()).getByRole('button', { name: 'src' }).parentElement?.getAttribute('aria-expanded')).toBe('true')
  })

  it('on main: the same tree, no marks and no Only changed, and it opens on the README', () => {
    show('/workspaces/w1/view')
    expect(screen.queryByRole('button', { name: /Only changed/ })).toBeNull()
    expect(within(tree()).queryAllByRole('img')).toHaveLength(0)
    expect(screen.getByText('opened README.md from git')).toBeTruthy()
  })
})

describe('a file opened whole, its changes in place', () => {
  it('opens on the first changed file in the tree, with every line and its changes where they are', () => {
    show('/workspaces/w1/view?branch=login-page')
    const file = screen.getByTestId('changed-file')
    expect(file.textContent).toContain('src/pages/Login.tsx')
    expect(file.textContent).toContain('new on this branch')
    expect(file.querySelectorAll('tr[data-line="add"]')).toHaveLength(3)
  })

  it('steps between the changes with ↑↓, and Changes only folds the unchanged lines', () => {
    show('/workspaces/w1/view?branch=login-page&file=src%2FApp.tsx')
    const file = screen.getByTestId('changed-file')
    expect(file.querySelectorAll('tbody tr')).toHaveLength(42)
    expect(within(file).getByTestId('change-stepper').textContent).toContain('1 of 2 changes')
    expect(file.querySelector('tr[data-current]')?.textContent).toContain('line 5')
    expect((within(file).getByRole('button', { name: 'Previous change' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(file).getByRole('button', { name: 'Next change' }))
    expect(within(file).getByTestId('change-stepper').textContent).toContain('2 of 2 changes')
    expect(file.querySelector('tr[data-current]')?.textContent).toContain('line 30')
    expect((within(file).getByRole('button', { name: 'Next change' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(within(file).getByRole('button', { name: 'Changes only' }))
    expect(within(file).getByRole('button', { name: 'Changes only' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(file).getAllByText(/unchanged line/).map(e => e.textContent)).toEqual(['1 unchanged line', '18 unchanged lines', '7 unchanged lines'])
    fireEvent.click(within(file).getByRole('button', { name: 'Whole file' }))
    expect(within(file).queryByText(/unchanged line/)).toBeNull()
  })

  it('a deleted file opens from the tree, its old lines removed, read at the base only', () => {
    show('/workspaces/w1/view?branch=login-page')
    fireEvent.click(within(tree()).getByRole('button', { name: /old-notes\.md/ }))
    expect(screen.getByTestId('where').textContent).toContain('file=docs%2Fold-notes.md')
    const file = screen.getByTestId('changed-file')
    expect(file.textContent).toContain('deleted on this branch')
    expect(file.querySelectorAll('tr[data-line="del"]')).toHaveLength(2)
    expect([...new Set(askedFor('getGitFile').filter(a => a.path === 'docs/old-notes.md').map(a => a.at))]).toEqual(['base'])
  })

  it('an address naming a change (diff=) opens that file whole', () => {
    show('/workspaces/w1/view?branch=login-page&section=git&diff=src%2FApp.tsx')
    expect(screen.getByTestId('changed-file').textContent).toContain('src/App.tsx')
    expect(screen.getByTestId('files-tree')).toBeTruthy()
  })

  it('an unchanged file opens in the file viewer, as on main', () => {
    show('/workspaces/w1/view?branch=login-page')
    fireEvent.click(screen.getByRole('button', { name: 'Only changed · 3' }))
    fireEvent.click(within(tree()).getByRole('button', { name: 'main.tsx' }))
    expect(screen.getByText('opened src/main.tsx from git')).toBeTruthy()
  })

  it('Open a file… finds a file by name and opens it', () => {
    show('/workspaces/w1/view?branch=login-page')
    const box = screen.getByRole('searchbox', { name: 'Open a file' })
    fireEvent.change(box, { target: { value: 'app' } })
    expect(within(screen.getByRole('listbox', { name: 'Files that match' })).getAllByRole('option').map(o => o.textContent)).toEqual(['src/App.tsx'])
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByTestId('where').textContent).toContain('file=src%2FApp.tsx')
  })
})

describe('main at an older version', () => {
  it('reads the tree and the file as they were at that version, read-only', () => {
    show('/workspaces/w1/view?version=v12&file=src%2FApp.tsx')
    expect(askedFor('getMainVersionAt').length).toBeGreaterThan(0)
    expect(askedFor('getMainVersionAt').every(a => a.workspaceId === 'w1' && a.version === 'v12')).toBe(true)
    expect(askedFor('getGitTree').every(a => JSON.stringify(a.ref) === JSON.stringify({ kind: 'main', version: C12 }))).toBe(true)
    // The file itself is opened at that version's commit, through hq's open and a relay.
    expect(JSON.parse(screen.getByText('opened src/App.tsx from git').getAttribute('data-key')!)).toMatchObject({ path: 'src/App.tsx', commit: C12 })
    expect(screen.getByTestId('version-file').textContent).toBe('src/App.tsx as it was at v12 · read-only')
  })

  it('marks that version’s own changes, opens on the first, and reads its other side at the version before it', () => {
    answers.value.getMainVersionChanges = {
      base: C11, head: C12, overflow: false,
      files: [{ path: 'src/App.tsx', status: 'modified', from: null, additions: 2, deletions: 2 }, { path: 'README.md', status: 'added', from: null, additions: 1, deletions: 0 }],
    }
    show('/workspaces/w1/view?version=v12')
    expect(askedFor('getMainVersionChanges').length).toBeGreaterThan(0)
    expect(askedFor('getMainVersionChanges').every(a => a.workspaceId === 'w1' && a.version === C12)).toBe(true)
    expect(screen.getByRole('button', { name: 'Only changed in v12 · 2' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(tree()).getAllByRole('button').map(b => b.textContent)).toEqual(['src', 'App.tsxM', 'README.mdA'])
    const file = screen.getByTestId('changed-file')
    expect(file.textContent).toContain('src/App.tsx')
    expect(file.textContent).toContain('changed in v12')
    const reads = askedFor('getGitFile').filter(a => a.path === 'src/App.tsx').map(a => ({ ref: a.ref, at: a.at }))
    expect(reads).toEqual(expect.arrayContaining([{ ref: { kind: 'main', version: C11 }, at: 'tip' }, { ref: { kind: 'main', version: C12 }, at: 'tip' }]))
    expect(reads.some(r => r.at === 'base')).toBe(false)
  })

  it('without its own changes (a site too old to say) it shows no marks and opens on the README, read-only', () => {
    answers.value.getMainVersionChanges = null
    show('/workspaces/w1/view?version=v12')
    expect(screen.queryByRole('button', { name: /Only changed/ })).toBeNull()
    expect(within(tree()).queryAllByRole('img')).toHaveLength(0)
    expect(screen.getByTestId('version-file').textContent).toBe('README.md as it was at v12 · read-only')
  })

  it('at the latest version reads main at its tip', () => {
    answers.value.getMainVersionAt = { number: 14, commit: 'h'.repeat(40), latest: true }
    show('/workspaces/w1/view?version=v14')
    expect(askedFor('getGitTree').every(a => JSON.stringify(a.ref) === JSON.stringify({ kind: 'main' }))).toBe(true)
    expect(screen.queryByTestId('version-file')).toBeNull()
  })

  it('says so when the version is none of main’s, and reads nothing', () => {
    // A final answer: said in its own words in place, not asked again, never a dialog.
    answers.value.getMainVersionAt = Object.assign(new Error("That isn't one of main's versions. Choose one from main's versions. Nothing was changed."), { statusCode: 404 })
    show('/workspaces/w1/view?version=v99')
    expect(screen.getAllByText(/isn't one of main's versions/).length).toBeGreaterThan(0)
    expect(askedFor('getGitTree')).toEqual([])
    expect(askedFor('getMainVersionChanges')).toEqual([])
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('on a phone', () => {
  beforeEach(() => { Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 }) })

  it('the tree comes first, full width, and a file opens on its own screen with ↑↓ at the foot', () => {
    show('/workspaces/w1/view?branch=login-page&section=files')
    expect(screen.queryByTestId('changed-file')).toBeNull()
    fireEvent.click(within(tree()).getByRole('button', { name: /App\.tsx/ }))
    const file = screen.getByTestId('changed-file')
    expect(file.textContent).toContain('src/ · changed on this branch')
    fireEvent.click(within(file).getByRole('button', { name: /Next change/ }))
    expect(file.textContent).toContain('2 of 2')
    expect(file.querySelector('td.whitespace-pre-wrap')).toBeTruthy()
    fireEvent.click(within(file).getByRole('button', { name: 'Back to the files' }))
    expect(screen.queryByTestId('changed-file')).toBeNull()
    expect(tree()).toBeTruthy()
  })
})
