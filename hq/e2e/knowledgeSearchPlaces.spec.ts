import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { openKnowledge, projectKnowledge, sectionsTree } from './fixtures/knowledgeTool'
import { skipUnlessSeeded } from './fixtures/seeded'

/**
 * The Knowledge tool on a phone, one level at a time, and search from Your space (agent knowledge spec, screens U2 and
 * U5). Neither writes anything: they read the project made by seed-e2e-knowledge.mjs (E2E_KNOWLEDGE_PROJECT_KEY) and
 * the administrator's own space.
 */
const KEY = process.env.E2E_KNOWLEDGE_PROJECT_KEY

test.describe('the Knowledge tool on a phone @SC-1426 @SC-1429', () => {
  skipUnlessSeeded(test, { E2E_KNOWLEDGE_PROJECT_KEY: KEY }, 'needs a project: run seed-e2e-knowledge.mjs and set E2E_KNOWLEDGE_PROJECT_KEY')
  test.use({ viewport: { width: 375, height: 812 } })

  test('shows the sections, then a view\'s pages, never both trees at once', async ({ page }) => {
    await signIn(page, ADMIN)
    await openKnowledge(page, projectKnowledge(KEY!))
    // The sections level has no side tree: that is the wide layout's.
    await expect(sectionsTree(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'All pages' }).first().click()
    await expect(page.getByRole('heading', { name: 'All pages', exact: true })).toBeVisible()
    await expect(sectionsTree(page)).toHaveCount(0)
    // Back is one level up, to the sections.
    await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'All pages', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'All pages' }).first()).toBeVisible()
  })
})

test.describe('searching knowledge from Your space @SC-1426', () => {
  test('This project reads Your space, and the organisation\'s pages are only in the other choices', async ({ page }) => {
    await signIn(page, ADMIN)
    await openKnowledge(page, '/chat?tool=knowledge')
    await page.getByLabel('Search knowledge').fill('release')
    const search = page.getByTestId('text-search')
    await expect(search).toBeVisible()
    // In Your space the first choice reads Your space, not This project.
    await expect(search.getByRole('radio', { name: 'Your space' })).toBeVisible()
    await expect(search.getByRole('radio', { name: 'This project' })).toHaveCount(0)
    await search.getByRole('radio', { name: 'Your space' }).click()
    await expect(search.getByRole('radio', { name: 'Your space' })).toHaveAttribute('aria-checked', 'true')
    await expect(search.getByText('Searching…')).toHaveCount(0, { timeout: 15_000 })
    // Whatever matches comes from Your space alone.
    for (const from of await search.getByTestId('hit-from').allTextContents()) expect(from).toBe('Your space')
  })
})
