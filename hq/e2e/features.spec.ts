import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'

// The Features screen (live preview spec section 7; adr-0172), against a running development hq: every flag listed by
// stage with the stages explained, and a switch that turns a feature on for the whole organisation and off again. The
// seed leaves every flag at production's value, so the Marketplace (at preview) starts off.

test.use({ viewport: { width: 1280, height: 800 } })
// One worker, in order: the switch is the organisation's, and the Library's spec expects the Marketplace off.
test.describe.configure({ mode: 'default' })

const marketplaceSwitch = (page: Page) => page.getByTestId('feature-marketplace').getByRole('switch')

test('lists every flag by stage in a development build, with each stage explained', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/admin/settings/features')
  await expect(page.getByRole('heading', { name: 'Features' }).first()).toBeVisible()
  const meanings = page.getByLabel('What the stages mean')
  for (const stage of ['Experimental', 'Preview', 'Beta', 'New in this release']) await expect(meanings).toContainText(stage)
  await expect(page.getByRole('region', { name: 'Preview' }).getByTestId('feature-marketplace')).toBeVisible()
  await expect(marketplaceSwitch(page)).toHaveAttribute('aria-checked', 'false')
})

test('switching a feature on shows it for the organisation, and switching it off hides it again', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/admin/settings/features')
  await marketplaceSwitch(page).click()
  await expect(marketplaceSwitch(page)).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('feature-marketplace')).toContainText('e2e-admin')

  await page.goto('/library')
  await expect(page.getByRole('link', { name: 'Marketplace' })).toBeVisible()

  await page.goto('/admin/settings/features')
  await marketplaceSwitch(page).click()
  await expect(marketplaceSwitch(page)).toHaveAttribute('aria-checked', 'false')
  await page.goto('/library')
  await expect(page.getByRole('link', { name: 'Marketplace' })).toHaveCount(0)
})

test('a member cannot open the Features screen', async ({ page }) => {
  await signIn(page, MEMBER)
  await page.goto('/admin/settings/features')
  await expect(page.getByTestId('feature-marketplace')).toHaveCount(0)
})
