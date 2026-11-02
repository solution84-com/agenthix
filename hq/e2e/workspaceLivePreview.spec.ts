import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

/**
 * The workspace view's *Live preview* (live preview spec, part 4). It opens a real workspace (E2E_WORKSPACE_ID, as the
 * workspace view's spec does) and answers the branch and live-preview operations itself, and the app's address, so the
 * screens are checked with no site running a live preview. Nothing is started on a site.
 */
const WORKSPACE = process.env.E2E_WORKSPACE_ID
const APP = 'https://p-7f3a.preview.example.com'

const main = { name: 'main', head: 'a'.repeat(40), versionCount: 14 }
const login = {
  id: 'b1', name: 'login-page', ahead: 6, behind: 0, lastCommitAt: null, livePreview: null, agentName: 'Kernel',
  whose: { kind: 'conversation', conversationId: 'c-e2e', title: 'Login page', personId: null, personName: 'Mia' }, working: null,
}
const site = { executionSiteId: 'es1', name: 'preview-box', open: 2, limit: 6 }
const now = new Date().toISOString()
const running = {
  livePreviewId: 'lp1', workspaceId: WORKSPACE ?? 'w', branchId: 'b1', branch: 'login-page', onMain: false, state: 'running', reason: null,
  detail: null, since: now, site, startedBy: { id: 'u1', name: 'Mia' }, yours: true, mayStop: true, mayResume: false, autoReload: true,
  openedAt: now, lastUsedAt: now, startable: [], services: [], questions: [], workflows: { start: false, reload: false },
  apps: [{ appId: 'a7f3a', name: 'web', folder: '', command: 'npm run dev', port: 5173, state: 'running', since: now, detail: null, lastLines: [], address: APP }],
}
const places = { current: null, mayStart: true, blocked: null, needsGit: false, picked: site, others: [], full: null, lastStopped: null }

async function answer(page: Page, answers: Record<string, unknown>) {
  const all: Record<string, unknown> = {
    'get-workspace-branches': { git: true, canAct: true, main, branches: [login] },
    'get-branch-changes': { base: 'b'.repeat(40), head: 'c'.repeat(40), overflow: false, baseVersion: 14, files: [] },
    'get-branch-commits': { commits: [], overflow: false },
    'get-git-tree': { exists: true, overflow: false, entries: [] },
    'mark-live-preview-in-use': null,
    'open-live-app': { action: `${APP}/__relay/enter`, field: 'ticket', ticket: 'e2e-ticket', origin: APP, target: 'frame', expiresAt: Date.now() + 15 * 60_000 },
    ...answers,
  }
  for (const [name, json] of Object.entries(all)) {
    await page.route(`**/operations/${name}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json }) }))
  }
  await page.route(`${APP}/**`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><h1>Welcome back</h1>' }))
}

test.describe("the workspace view's Live preview", () => {
  test.skip(!WORKSPACE, 'needs a workspace: set E2E_WORKSPACE_ID')

  test.beforeEach(async ({ page }) => { await signIn(page, ADMIN) })

  test('before one runs: where it would start and how full, and Start asks HQ for that site @SC-1696', async ({ page }) => {
    await answer(page, { 'get-live-preview-places': places })
    let started: unknown = null
    await page.route('**/operations/start-live-preview', async route => {
      started = (route.request().postDataJSON() as { json?: unknown }).json
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json: running }) })
    })
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page`)
    await page.getByTestId('live-preview-row').click()
    await expect(page).toHaveURL(/section=preview/)
    await expect(page.getByTestId('workspace-strip')).toBeVisible()
    await expect(page.getByText('Runs on preview-box · 2 of 6 open.')).toBeVisible()
    await page.getByRole('button', { name: /Start live preview/ }).click()
    await expect.poll(() => started).toMatchObject({ branchId: 'b1', executionSiteId: 'es1' })
  })

  test('running: its own bar stays at the top, and the app shows in the frame @SC-1697', async ({ page }) => {
    await answer(page, { 'get-live-preview-places': { ...places, current: running }, 'get-live-preview': running })
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page&section=preview`)
    const bar = page.getByTestId('live-preview-bar')
    await expect(bar).toContainText('Running')
    await expect(bar).toContainText('preview-box · 2 of 6 open')
    await expect(page.getByTestId('live-preview-address')).toHaveText(APP)
    await expect(page.frameLocator('[data-testid="live-app-frame"]').getByText('Welcome back')).toBeVisible()
  })

  test('on a tablet, the conversation drawer opens below the live preview bar @SC-1697', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1000 })
    await answer(page, { 'get-live-preview-places': { ...places, current: running }, 'get-live-preview': running })
    await page.goto(`/workspaces/${WORKSPACE}/view?branch=login-page&section=preview`)
    await page.getByRole('button', { name: 'Conversation' }).click()
    const barBottom = (await page.getByTestId('live-preview-bar').boundingBox())!
    const drawerTop = (await page.getByTestId('workspace-conversation').boundingBox())!
    expect(drawerTop.y).toBeGreaterThanOrEqual(barBottom.y + barBottom.height - 1)
  })
})
