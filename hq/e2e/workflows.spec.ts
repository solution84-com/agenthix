import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { at } from './fixtures/address'

// The Workflows screens (workflows spec part 5): the entry in a place's panel, the section, a workflow, a version's
// full review, and a run. Your space is the place used, since every person has one and administers it.
//
// The section and the panel need no data. A workflow's page, its review and its run need one that exists: name them
// with E2E_WORKFLOW_ID (a workflow in the admin's own space with an approved version), E2E_WORKFLOW_PROPOSED_VERSION
// (a version of it waiting for a decision) and E2E_WORKFLOW_RUN_ID (one of its runs). A spec whose data is not there
// skips rather than fails. None of them approves or declines anything.

const WORKFLOW_ID = process.env.E2E_WORKFLOW_ID
const PROPOSED_VERSION = process.env.E2E_WORKFLOW_PROPOSED_VERSION
const RUN_ID = process.env.E2E_WORKFLOW_RUN_ID
// A conversation of the admin's whose agent started a workflow run (within the last half hour), for its card in the work bar.
const RUN_CONVERSATION_ID = process.env.E2E_WORKFLOW_RUN_CONVERSATION_ID

const sections = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('list', { name: 'Your space sections' })

test.describe('Workflows on a wide window', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN)
  })

  test('the panel has Workflows after Automation, and it opens the section @SC-1290', async ({ page }) => {
    await page.goto('/space')
    await expect(sections(page).getByRole('link', { name: /^Workflows/ })).toBeVisible()
    const links = sections(page).getByRole('link')
    const names = await links.allInnerTexts()
    const indexOfLabel = (label: string) => names.findIndex((n) => n.startsWith(label))
    expect(indexOfLabel('Workflows')).toBeGreaterThan(indexOfLabel('Automation'))
    await sections(page).getByRole('link', { name: /^Workflows/ }).click()
    await expect(page).toHaveURL(at('/space?tool=workflows'))
    await expect(sections(page).getByRole('link', { name: /^Workflows/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('open-tool')).toBeVisible()
    await expect(page.getByRole('region', { name: 'All workflows' })).toBeVisible()
  })

  test('a workflow opens with Steps, Versions and Runs, and Run asks for each parameter @SC-1290', async ({ page }) => {
    test.skip(!WORKFLOW_ID, 'needs a workflow: set E2E_WORKFLOW_ID')
    await page.goto(`/workflows/${WORKFLOW_ID}`)
    await expect(page).toHaveURL(at(`/space?tool=workflows&workflow=${WORKFLOW_ID}`))
    await expect(page.getByRole('list', { name: 'Steps' })).toBeVisible()
    await expect(page.getByTestId('workflow-step').first()).toBeVisible()
    await page.getByRole('button', { name: /^Versions/ }).click()
    await expect(page.getByRole('list', { name: 'Versions' })).toBeVisible()
    await page.getByRole('button', { name: /^Runs/ }).click()
    await expect(page).toHaveURL(/wtab=runs/)
  })

  test('the card’s link opens the full review: the reviewer first, then the checks and the changes @SC-1289', async ({ page }) => {
    test.skip(!WORKFLOW_ID || !PROPOSED_VERSION, 'needs a waiting version: set E2E_WORKFLOW_ID and E2E_WORKFLOW_PROPOSED_VERSION')
    await page.goto(`/workflows/${WORKFLOW_ID}/versions/${PROPOSED_VERSION}`)
    await expect(page).toHaveURL(/version=/)
    const reviewer = page.getByTestId('review-points')
    const checks = page.getByTestId('review-checks')
    await expect(reviewer).toBeVisible()
    await expect(checks).toBeVisible()
    expect((await reviewer.boundingBox())!.y).toBeLessThan((await checks.boundingBox())!.y)
    for (const tab of ['Changes', 'All files', 'Steps']) await expect(page.getByRole('button', { name: tab })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`^Approve version ${PROPOSED_VERSION}$`) })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Decline' })).toBeVisible()
  })

  test('a run shows one row per step @SC-1298', async ({ page }) => {
    test.skip(!WORKFLOW_ID || !RUN_ID, 'needs a run: set E2E_WORKFLOW_ID and E2E_WORKFLOW_RUN_ID')
    await page.goto(`/workflows/${WORKFLOW_ID}/runs/${RUN_ID}`)
    await expect(page).toHaveURL(/run=/)
    await expect(page.getByRole('list', { name: 'Steps' }).getByTestId('run-step').first()).toBeVisible()
  })
})

test.describe('A workflow run in the conversation that started it @SC-1299', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the finished run has its card in the thread, which opens the run', async ({ page }) => {
    test.skip(!RUN_CONVERSATION_ID, 'needs a conversation that started a run, now finished: set E2E_WORKFLOW_RUN_CONVERSATION_ID')
    await signIn(page, ADMIN)
    await page.goto(`/chat/t/${RUN_CONVERSATION_ID}`)
    const card = page.getByTestId('thread-workflow-run').first()
    await expect(card).toBeVisible()
    await card.getByRole('link', { name: 'Open the run' }).click()
    await expect(page).toHaveURL(/run=|\/workflows\//)
  })
})

test.describe('Workflows on a phone @SC-1290', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the section has no horizontal scroll and its entry is in the drawer', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/space?tool=workflows')
    await expect(page.getByTestId('open-tool')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('a workflow’s page keeps Run full width and has no horizontal scroll', async ({ page }) => {
    test.skip(!WORKFLOW_ID, 'needs a workflow: set E2E_WORKFLOW_ID')
    await signIn(page, ADMIN)
    await page.goto(`/workflows/${WORKFLOW_ID}`)
    await expect(page.getByRole('button', { name: /^Run / }).first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
