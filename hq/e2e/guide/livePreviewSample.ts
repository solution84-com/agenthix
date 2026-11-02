/**
 * What the live preview recipes share. A live preview runs on a site, in containers the guide's run does not make, so
 * these recipes draw one: the workspace and the conversation are the sample organisation's own (Website relaunch's
 * `website-code`, and Sam's conversation with Writer about the About page), and Playwright answers the branch and
 * live-preview operations, and the app's address, with the sample below. Nothing is started on a site.
 */
import { expect, type Page } from '@playwright/test'
import type { BranchLineView, WorkspaceBranchesView } from '../../src/branches/views'
import type { LiveAppEntryForm, LivePreviewPlaces, LivePreviewSiteView, LivePreviewView } from '../../src/livePreviews/types'
import { sample } from './capture'

const NOW = Date.parse(sample.clock.now)
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

export const BRANCH = 'about-page-intro'
const CONVERSATION = 'Rewrite the About page introduction'
export const APP_ADDRESS = 'https://p-7f3a9c.preview.fernhill.example'

export const OFFICE_SERVER: LivePreviewSiteView = { executionSiteId: 'sample-site-office', name: 'office-server', open: 2, limit: 6 }
const HQ_SITE: LivePreviewSiteView = { executionSiteId: 'sample-site-hq', name: 'fernhill-hq', open: 0, limit: 2 }

/** Sam's live preview of the branch, running the website's development server. */
export const RUNNING: LivePreviewView = {
  livePreviewId: 'sample-live-preview', workspaceId: 'set-when-opened', branchId: 'sample-branch', branch: BRANCH, onMain: false,
  state: 'running', reason: null, detail: null, since: ago(25), site: OFFICE_SERVER,
  startedBy: { id: 'sample-user-sam', name: 'Sam Okafor' }, yours: true, mayStop: true, mayResume: false, autoReload: true,
  openedAt: ago(25), lastUsedAt: ago(1),
  apps: [{
    appId: 'a7f3a9c', name: 'website', folder: '', command: 'npm run dev', port: 4321, state: 'running', since: ago(24),
    detail: null, lastLines: [], address: APP_ADDRESS,
  }],
  startable: [], services: [], questions: [], workflows: { start: false, reload: false }, secrets: null,
}

export const PLACES: LivePreviewPlaces = {
  current: null, mayStart: true, blocked: null, needsGit: false, picked: OFFICE_SERVER,
  others: [{ ...HQ_SITE, blocked: null, full: false }], full: null, lastStopped: null,
}

/** The app as the frame shows it: the new About page the branch is writing. */
const APP_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>About · Fernhill &amp; Co</title>
<style>
  body { margin: 0; font: 16px/1.6 Georgia, serif; color: rgb(34, 34, 34); background: rgb(250, 248, 244); }
  header { display: flex; justify-content: space-between; padding: 20px 48px; font: 600 15px/1 system-ui, sans-serif; }
  nav a { margin-left: 24px; color: inherit; text-decoration: none; }
  main { max-width: 640px; margin: 56px auto; padding: 0 24px; }
  h1 { font-size: 40px; line-height: 1.15; margin: 0 0 24px; }
  p { margin: 0 0 18px; }
</style></head><body>
<header><span>Fernhill &amp; Co</span><nav><a href="#">Work</a><a href="#">About</a><a href="#">Contact</a></nav></header>
<main><h1>About us</h1>
<p>Fernhill &amp; Co is a small studio that makes websites and reports.</p>
<p>We work with a handful of clients at a time, so you always talk to the people doing the work.</p></main>
</body></html>`

/** Writer's reply in the conversation beside the live preview, which every live preview picture shows. */
export const conversationShown = (page: Page) =>
  expect(page.getByTestId('workspace-conversation').getByText('so you always talk to the people doing the work', { exact: false }).first()).toBeVisible()

/**
 * From the page capture opened (Chat), finds the sample's conversation and `website-code`, answers the branch and
 * live-preview operations with `live`, and opens the workspace view on the branch's live preview.
 */
export async function openLivePreview(page: Page, live: { places: LivePreviewPlaces; view?: LivePreviewView }): Promise<void> {
  // Chat may already have opened another conversation in the dock, so wait for the one clicked to be the one docked.
  await page.getByTestId('conversation-row').filter({ hasText: CONVERSATION }).click()
  await expect(page.getByTestId('dock').getByText('so you always talk to the people doing the work', { exact: false }).first()).toBeVisible()
  const conversationId = new URL(page.url()).searchParams.get('c') ?? ''

  await page.goto('/projects/WEB?tool=workspaces')
  await page.getByText('website-code', { exact: true }).click()
  await expect(page).toHaveURL(/\/workspaces\/[^/]+\/view/)
  const workspaceId = /\/workspaces\/([^/]+)\/view/.exec(page.url())?.[1] ?? ''

  const line: BranchLineView = {
    id: 'sample-branch', name: BRANCH, ahead: 3, behind: 0, lastCommitAt: ago(4), agentName: 'Writer', working: null,
    livePreview: live.view ? { livePreviewId: live.view.livePreviewId, state: 'running' } : null,
    whose: { kind: 'conversation', conversationId, title: CONVERSATION, personId: null, personName: 'Sam Okafor' },
  }
  const branches: WorkspaceBranchesView = { git: true, canAct: true, main: { name: 'main', head: 'a'.repeat(40), versionCount: 12 }, branches: [line] }
  const view = live.view ? { ...live.view, workspaceId } : null
  const entry: LiveAppEntryForm = {
    action: `${APP_ADDRESS}/__relay/enter`, field: 'ticket', ticket: 'sample-ticket', origin: APP_ADDRESS, target: 'frame', expiresAt: NOW + 15 * 60_000,
  }
  const answers: Record<string, unknown> = {
    'get-workspace-branches': branches,
    'get-branch-changes': { base: 'b'.repeat(40), head: 'c'.repeat(40), overflow: false, baseVersion: 12, files: [] },
    'get-branch-commits': { commits: [], overflow: false },
    'get-git-tree': { exists: true, overflow: false, entries: [] },
    'get-live-preview-places': { ...live.places, current: view },
    'get-live-preview': view,
    'mark-live-preview-in-use': null,
    'open-live-app': entry,
  }
  for (const [name, json] of Object.entries(answers)) {
    await page.route(`**/operations/${name}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json }) }))
  }
  await page.route(`${APP_ADDRESS}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: APP_PAGE }))

  await page.goto(`/workspaces/${workspaceId}/view?branch=${BRANCH}&section=preview`)
}
