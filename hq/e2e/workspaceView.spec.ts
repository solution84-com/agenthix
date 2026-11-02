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
  whose: { kind: 'conversation', conversationId: 'c-e2e', title: 'Login page', personId: null, personName: 'Mia' }, working: null,
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

  test('takes the whole screen: no HQ navigation, the back link, the switcher and Live preview stopped @SC-1683', async ({ page }) => {
    await answerBranchOperations(page)
    await page.goto(`/workspaces/${WORKSPACE}/view`)
    await expect(page.getByTestId('workspace-view')).toBeVisible()
    await expect(page.getByTestId('sidebar-foot')).toHaveCount(0)
    await expect(page.getByTestId('live-preview-row')).toContainText('Stopped')
    await expect(page.getByRole('button', { name: /^Workspace: / })).toBeVisible()
  })

  test('main shows its versions and a quiet Deploy…; a branch shows its changes and the diff in the middle @SC-1687 @SC-1691', async ({ page }) => {
    await answerBranchOperations(page)
    await page.goto(`/workspaces/${WORKSPACE}/view?section=git`)
    await expect(page.getByText('Ada · Fix the README links')).toBeVisible()
    await page.getByRole('button', { name: 'Deploy…' }).click()
    await expect(page.getByText(/No deploy workflow is set up/)).toBeVisible()

    await page.getByRole('button', { name: 'Branch: main' }).click()
    await page.getByRole('option', { name: /login-page/ }).click()
    await expect(page).toHaveURL(/branch=login-page/)
    await page.getByTestId('branch-git').getByText('App.tsx').click()
    await expect(page.getByTestId('workspace-diff').getByRole('table', { name: 'Changes' })).toBeVisible()
    await expect(page.getByTestId('workspace-diff')).toContainText('/login')
  })

  test('Merge into main shows the clash and merges nothing @SC-1690', async ({ page }) => {
    await answerBranchOperations(page)
    await page.route('**/operations/merge-branch', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json: {
      outcome: 'clash', agentAsked: true, clashes: [{ path: 'src/App.tsx', version: { number: 15, commit: 'e'.repeat(40), subject: 'Ada · Dark mode switch' } }],
    } }) }))
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page&section=git`)
    await page.getByRole('button', { name: 'Merge into main…' }).click()
    await expect(page.getByTestId('merge-dialog')).toContainText('one version — version 15')
    await page.getByTestId('merge-dialog').getByRole('button', { name: 'Merge into main', exact: true }).click()
    await expect(page.getByTestId('merge-dialog')).toContainText('Nothing was merged.')
  })

  test('a Viewer’s actions are disabled with the reason @SC-1692', async ({ page }) => {
    await answerBranchOperations(page, { 'get-workspace-branches': { git: true, canAct: false, main, branches: [login] } })
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page&section=git`)
    await expect(page.getByRole('button', { name: 'Merge into main…' })).toBeDisabled()
    await expect(page.getByTestId('branch-git')).toContainText('need a Member or Admin')
  })

  test('a workspace without Git offers Turn Git on @SC-1693', async ({ page }) => {
    await answerBranchOperations(page, { 'get-workspace-branches': { git: false, canAct: true } })
    await page.goto(`/workspaces/${WORKSPACE}/view`)
    await expect(page.getByTestId('turn-git-on')).toBeVisible()
  })

  test('a task’s branch shows the task’s conversation, whatever conversation the address’s c= names @SC-1685', async ({ page }) => {
    const task = { ...login, id: 'b2', name: 'fix-cart-total', whose: { kind: 'task', taskId: 't-e2e', taskKey: 'SHOP-14', title: 'Fix the cart total', personId: null, personName: null } }
    await answerBranchOperations(page, {
      'get-workspace-branches': { git: true, canAct: true, main, branches: [login, task] },
      'get-task-conversation': { conversation: null, canStart: true, refusal: null, lead: null },
    })
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=fix-cart-total&section=git&c=c-elsewhere`)
    await expect(page.getByTestId('task-first-message')).toContainText('task SHOP-14')
    await expect(page.getByTestId('dock')).toBeHidden()
  })

  test("Deploy… leaves out the live preview's own workflows and says how to add a deploy workflow", async ({ page }) => {
    const wf = (name: string) => ({ id: name, name, description: null, enabled: true, approved: { definition: { parameters: [] } } })
    await answerBranchOperations(page, { 'get-place-workflows': { workflows: [wf('start-live-preview'), wf('reload-live-preview')], mayRun: true, mayAdminister: false } })
    await page.goto(`/workspaces/${WORKSPACE}/view?section=git`)
    await page.getByRole('button', { name: 'Deploy…' }).click()
    await expect(page.getByTestId('deploy-none')).toContainText('No deploy workflow is set up')
    await expect(page.getByRole('button', { name: /Run start-live-preview/ })).toHaveCount(0)
  })

  test('an address naming a branch that is closed opens main and no longer names it', async ({ page }) => {
    await answerBranchOperations(page)
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=closed-long-ago&section=git`)
    await expect(page.getByRole('button', { name: 'Branch: main' })).toBeVisible()
    await expect(page).not.toHaveURL(/branch=/)
  })

  test("at laptop width the strip's Live preview has no dot while stopped", async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 800 })
    await answerBranchOperations(page)
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page&section=files`)
    await expect(page.getByRole('button', { name: /^Live preview · Stopped/ })).toBeVisible()
    await expect(page.getByTestId('strip-preview-dot')).toHaveCount(0)
  })

  test('New task on main makes a task on this workspace, starts it, and waits for its branch', async ({ page }) => {
    await answerBranchOperations(page)
    // Answered here, so nothing is made or run.
    await page.route('**/operations/create-task', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json: { id: 't-e2e', title: 'Free delivery over $50', number: 99 } }) }))
    await page.route('**/operations/run-task', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json: null }) }))
    await page.goto(`/workspaces/${WORKSPACE}/view?section=git`)
    await page.getByRole('button', { name: /New task/ }).click()
    const dialog = page.getByTestId('new-task-dialog')
    await dialog.getByLabel('Title').fill('Free delivery over $50')
    test.skip(await dialog.getByRole('button', { name: 'Make and start' }).isDisabled(), "the workspace's project has no agent to assign")
    await dialog.getByRole('button', { name: 'Make and start' }).click()
    await expect(page.getByTestId('pending-task')).toContainText('Free delivery over $50')
  })

  for (const [width, shown] of [[1180, 'workspace-strip'], [820, 'workspace-strip'], [390, 'workspace-conversation']] as const) {
    test(`at ${width} px it folds as the boards show @SC-1689`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await answerBranchOperations(page)
      await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page`)
      await expect(page.getByTestId(shown)).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  }
})
