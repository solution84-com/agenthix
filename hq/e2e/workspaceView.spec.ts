import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

/**
 * The full-screen workspace view (live preview spec, part 1). It opens a real workspace (E2E_WORKSPACE_ID, any
 * workspace the e2e administrator can read: a project's, from the Workspaces tool) and answers the branch operations
 * itself, so the screens are checked whatever the site's Git holds. Nothing is merged or restored.
 */
const WORKSPACE = process.env.E2E_WORKSPACE_ID

const main = { name: 'main', head: 'a'.repeat(40), versionCount: 14 }
const login = {
  id: 'b1', name: 'login-page', ahead: 6, behind: 0, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'task', taskId: 't-login', taskKey: 'WEB-1', title: 'Login page', personId: null, personName: null }, working: null,
}
// A conversation of someone else's: the signed-in administrator is not Mia, and a conversation is its opener's alone.
const miasLogin = {
  ...login, id: 'b4', name: 'mias-page',
  whose: { kind: 'conversation', conversationId: 'c-mia', title: 'Login page', personId: 'someone-else', personName: 'Mia Ross' },
}
const ANSWERS: Record<string, unknown> = {
  'get-workspace-branches': { git: true, canAct: true, main, branches: [login] },
  'get-branch-changes': { base: 'b'.repeat(40), head: 'c'.repeat(40), overflow: false, baseVersion: 14, files: [
    { path: 'src/App.tsx', status: 'modified', from: null, additions: 1, deletions: 1 },
  ] },
  'get-branch-commits': { commits: [], overflow: false },
  'get-main-versions': { hasMore: false, versions: [
    { number: 14, commit: main.head, subject: 'Kernel for Mia · Checkout page', author: { name: 'Mia', email: 'mia@example.com' }, files: 5, at: new Date().toISOString() },
    { number: 13, commit: 'd'.repeat(40), subject: 'Ada · Fix the README links', author: { name: 'Ada', email: 'ada@example.com' }, files: 1, at: new Date().toISOString() },
  ] },
  'get-git-tree': { exists: true, overflow: false, entries: [{ name: 'src', path: 'src', kind: 'dir', bytes: null }] },
  // The branches above are made up, so HQ would refuse the live preview's reads; a refused read is retried, which an
  // action's refresh of the queries it touches waits for.
  'get-main-version-at': { number: 13, commit: 'd'.repeat(40), latest: false },
  'get-live-preview-places': { current: null, mayStart: true, blocked: null, needsGit: false, picked: null, others: [], full: null, lastStopped: null },
}

async function answerBranchOperations(page: Page, overrides: Record<string, unknown> = {}) {
  for (const [name, json] of Object.entries({ ...ANSWERS, ...overrides })) {
    await page.route(`**/operations/${name}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json }) }))
  }
  await page.route('**/operations/get-git-file', async route => {
    const at = (route.request().postDataJSON() as { json?: { at?: string } } | null)?.json?.at
    const text = at === 'base' ? '<Route path="/sign-in" />\n' : '<Route path="/login" />\n'
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json: { exists: true, binary: false, tooLarge: false, bytes: text.length, text } }) })
  })
}

test.describe('the workspace view', () => {
  test.skip(!WORKSPACE, 'needs a workspace: set E2E_WORKSPACE_ID')

  test.beforeEach(async ({ page }) => { await signIn(page, ADMIN) })

  // Live preview in the panel and the strip, and hidden while its flag is off: workspaceLivePreview.spec.ts.
  test('sits in the app frame with its rail, the project menu hidden, the back link and the switcher @SC-1683', async ({ page }) => {
    await answerBranchOperations(page)
    await page.goto(`/workspaces/${WORKSPACE}/view`)
    await expect(page.getByTestId('workspace-view')).toBeVisible()
    // The rail stays, with its foot: who is signed in, Manage, Runs, Notifications. The view adds no foot of its own.
    const foot = page.getByTestId('sidebar-foot')
    await expect(foot.getByRole('button', { name: /, account menu$/ })).toBeVisible()
    await expect(foot.getByRole('link', { name: 'Manage' })).toBeVisible()
    await expect(page.getByTestId('view-foot')).toHaveCount(0)
    await expect(page.getByTestId('screen-bar')).toHaveCount(0)
    await expect(page.getByTestId('place-menu')).toHaveCount(0)
    await foot.getByRole('button', { name: 'Runs' }).click()
    await expect(page.getByRole('dialog', { name: 'Runs' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Workspace: / })).toBeVisible()
    // The app's chat panel stays beside the view; the view draws no conversation of its own.
    await expect(page.getByTestId('workspace-conversation')).toHaveCount(0)
  })

  test('a branch opens on its first changed file with its changes in place; the breadcrumb holds the branch and its chat @SC-1687', async ({ page }) => {
    await answerBranchOperations(page)
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page`)
    const top = page.getByTestId('workspace-top')
    await expect(top.getByRole('button', { name: 'Branch: login-page' })).toBeVisible()
    await expect(top.getByRole('button', { name: 'Chat' })).toBeVisible()
    await expect(top.getByRole('button', { name: 'Merge into main…' })).toBeVisible()
    await page.getByTestId('files-tree').getByText('App.tsx').click()
    await expect(page.getByTestId('changed-file').getByRole('table', { name: 'The file, its changes in place' })).toBeVisible()
    await expect(page.getByTestId('changed-file')).toContainText('/login')
  })

  test("main's version ▾ opens an older version read-only, with Back to latest and Return main to it… @SC-1691", async ({ page }) => {
    await answerBranchOperations(page)
    await page.goto(`/workspaces/${WORKSPACE}/view`)
    const top = page.getByTestId('workspace-top')
    await top.getByRole('button', { name: 'Version: v14 · latest' }).click()
    await page.getByTestId('version-list').getByText('Ada · Fix the README links').click()
    await expect(page).toHaveURL(/version=v13/)
    await expect(top.getByRole('button', { name: 'Back to latest' })).toBeVisible()
    await top.getByRole('button', { name: 'Return main to v13…' }).click()
    await expect(page.getByTestId('return-main-dialog')).toContainText('exactly the files of version 13')
    await page.getByTestId('return-main-dialog').getByRole('button', { name: 'Cancel' }).click()
    await top.getByRole('button', { name: 'Back to latest' }).click()
    await expect(page).not.toHaveURL(/version=/)
  })

  test('Merge into main… ends a clash with Bring up to date, which asks the branch’s agent @SC-1690', async ({ page }) => {
    await answerBranchOperations(page)
    await page.route('**/operations/merge-branch', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json: {
      outcome: 'clash', agentAsked: false, clashes: [{ path: 'src/App.tsx', version: { number: 15, commit: 'e'.repeat(40), subject: 'Ada · Dark mode switch' } }],
    } }) }))
    let asked: unknown = null
    await page.route('**/operations/bring-branch-up-to-date', route => {
      asked = (route.request().postDataJSON() as { json?: unknown } | null)?.json ?? null
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json: { asked: true } }) })
    })
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page`)
    await page.getByTestId('workspace-top').getByRole('button', { name: 'Merge into main…' }).click()
    const dialog = page.getByTestId('merge-dialog')
    await expect(dialog).toContainText('one version — version 15')
    await dialog.getByRole('button', { name: 'Merge login-page into main' }).click()
    await expect(dialog).toContainText('Nothing was merged')
    await expect(dialog).toContainText('This branch and main both changed src/App.tsx')
    await dialog.getByRole('button', { name: 'Bring up to date' }).click()
    await expect(page.getByTestId('workspace-top').getByRole('button', { name: 'Updating…' })).toBeVisible()
    expect(asked).toEqual({ branchId: 'b1' })
  })

  test("someone else's conversation is named, not linked, and its 💬 is disabled with why @SC-1685", async ({ page }) => {
    await answerBranchOperations(page, { 'get-workspace-branches': { git: true, canAct: true, main, branches: [login, miasLogin] } })
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=mias-page`)
    const top = page.getByTestId('workspace-top')
    await expect(top.getByRole('button', { name: /^Mia's chat/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(top.getByRole('button', { name: 'Chat', exact: true })).toHaveCount(0)
    await top.getByRole('button', { name: 'Branch: mias-page' }).click()
    await expect(page.getByTestId('branch-origin-text')).toHaveText("Mia's conversation, Login page")
  })

  test('a branch behind main says Bring up to date, with why on hover', async ({ page }) => {
    await answerBranchOperations(page, { 'get-workspace-branches': { git: true, canAct: true, main, branches: [{ ...login, behind: 3 }] } })
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page`)
    await expect(page.getByTestId('workspace-top').getByRole('button', { name: 'Bring up to date' })).toHaveAttribute('title', /main has 3 newer versions/)
  })

  test('a Viewer gets no next-step button; the branch menu says who can update it @SC-1692', async ({ page }) => {
    await answerBranchOperations(page, { 'get-workspace-branches': { git: true, canAct: false, main, branches: [login] } })
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page`)
    const top = page.getByTestId('workspace-top')
    await expect(top.getByRole('button', { name: /Merge into main|Bring up to date/ })).toHaveCount(0)
    await top.getByRole('button', { name: 'Branch: login-page' }).click()
    await expect(page.getByTestId('branch-list')).toContainText('need a Member or Admin')
  })

  test('a workspace without Git offers Keep versions with Git…, which says first it cannot be undone @SC-1693', async ({ page }) => {
    await answerBranchOperations(page, { 'get-workspace-branches': { git: false, canAct: true } })
    await page.goto(`/workspaces/${WORKSPACE}/view`)
    await page.getByTestId('workspace-top').getByRole('button', { name: 'Keep versions with Git…' }).click()
    await expect(page.getByTestId('turn-git-on')).toContainText("This can't be undone.")
    await expect(page.getByTestId('turn-git-on').getByRole('button', { name: /^Turn on Git for / })).toBeVisible()
  })

  test("💬 Chat opens a task's conversation in the app's chat panel; browsing does not @SC-1685", async ({ page }) => {
    const task = { ...login, id: 'b2', name: 'fix-cart-total', whose: { kind: 'task', taskId: 't-e2e', taskKey: 'SHOP-14', title: 'Fix the cart total', personId: null, personName: null } }
    await answerBranchOperations(page, {
      'get-workspace-branches': { git: true, canAct: true, main, branches: [login, task] },
      'get-task-conversation': { conversation: null, canStart: true, refusal: null, lead: null },
    })
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=fix-cart-total`)
    await expect(page.getByTestId('task-first-message')).toHaveCount(0)
    await page.getByTestId('workspace-top').getByRole('button', { name: 'Chat' }).click()
    await expect(page.getByTestId('dock')).toBeVisible()
  })

  test("Deploy… is in About, leaves out the live preview's own workflows and says how to add a deploy workflow", async ({ page }) => {
    const wf = (name: string) => ({ id: name, name, description: null, enabled: true, approved: { definition: { parameters: [] } } })
    await answerBranchOperations(page, { 'get-place-workflows': { workflows: [wf('start-live-preview'), wf('reload-live-preview')], mayRun: true, mayAdminister: false } })
    await page.goto(`/workspaces/${WORKSPACE}/view`)
    await page.getByTestId('workspace-top').getByRole('button', { name: 'About' }).click()
    await page.getByTestId('view-about').getByRole('button', { name: 'Deploy…' }).click()
    await expect(page.getByTestId('deploy-none')).toContainText('No deploy workflow is set up')
    await expect(page.getByRole('button', { name: /Run start-live-preview/ })).toHaveCount(0)
  })

  test('an address naming a branch that is closed opens main and no longer names it', async ({ page }) => {
    await answerBranchOperations(page)
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=closed-long-ago`)
    await expect(page.getByRole('button', { name: 'Branch: main' })).toBeVisible()
    await expect(page).not.toHaveURL(/branch=/)
  })

  test("a workspace that can't be opened says why and links back, instead of loading for ever", async ({ page }) => {
    await page.route('**/operations/get-workspace', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Using this project\'s storage requires membership of this project' }) }))
    await page.route('**/operations/get-workspace-refusal', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json: { reason: 'no_access', project: { name: 'Website relaunch', key: 'WEB' } } }) }))
    await page.goto(`/workspaces/${WORKSPACE ?? 'w-none'}/view`)
    await expect(page.getByRole('heading', { name: "You can't open this workspace" })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('link', { name: 'Back to Website relaunch' })).toHaveAttribute('href', '/projects/WEB')
  })

  for (const [width, shown] of [[1180, 'workspace-left'], [820, 'workspace-left'], [390, 'phone-foot']] as const) {
    test(`at ${width} px it keeps what the boards show @SC-1689`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await answerBranchOperations(page)
      await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page`)
      await expect(page.getByTestId(shown)).toBeVisible()
      await expect(page.getByTestId('workspace-strip')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  }
})
