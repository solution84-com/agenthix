import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { at } from './fixtures/address'

// The GitHub screens (workflows spec part 5, G1–G3): the GitHub page in the admin area, Infrastructure's card
// linking to it, the old registration address, and a project's GitHub section. They need no GitHub App: an HQ without
// one shows the registration, one with it shows the App, so each check holds for both. A project's section needs a
// project: name its key with E2E_PROJECT_KEY (the spec skips without it). Nothing here registers, allows, ignores
// or connects anything.

const PROJECT_KEY = process.env.E2E_PROJECT_KEY

test.describe('GitHub on a wide window', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN)
  })

  test('the GitHub page shows the App, or the registration when there is none @SC-1308', async ({ page }) => {
    await page.goto('/admin/settings/github')
    await expect(page.getByRole('heading', { name: 'GitHub', level: 1 })).toBeVisible()
    const registered = page.getByRole('region', { name: 'The App' })
    const registration = page.getByRole('region', { name: 'Register the GitHub App' })
    await expect(registered.or(registration)).toBeVisible()
    await expect(page.getByRole('button', { name: /Refresh/ })).toHaveCount(0)
    if (await registered.isVisible()) {
      await expect(page.getByRole('list', { name: "The App's permissions" }).or(page.getByText(/couldn't read the permissions/))).toBeVisible()
      await expect(page.getByRole('region', { name: 'GitHub accounts' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Get an install link for a client' })).toBeVisible()
    }
  })

  test('Infrastructure’s GitHub App card links to the page, and the old address lands there @SC-1308', async ({ page }) => {
    await page.goto('/admin/infrastructure')
    await page.getByRole('link', { name: /GitHub App/ }).click()
    await expect(page).toHaveURL(at('/admin/settings/github'))
    await page.goto('/admin/infrastructure/github-app')
    await expect(page).toHaveURL(at('/admin/settings/github'))
  })

  test('a project’s GitHub address opens its GitHub section @SC-1313', async ({ page }) => {
    test.skip(!PROJECT_KEY, 'needs a project: set E2E_PROJECT_KEY')
    await page.goto(`/projects/${PROJECT_KEY}/github`)
    await expect(page).toHaveURL(at(`/projects/${PROJECT_KEY}?tool=github`))
    await expect(page.getByRole('region', { name: 'Default account' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Workspaces and their repositories' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Workflows that reach GitHub' })).toBeVisible()
  })
})

test.describe('GitHub on a phone @SC-1308', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the GitHub page has no horizontal scroll', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/admin/settings/github')
    await expect(page.getByRole('heading', { name: 'GitHub', level: 1 })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
