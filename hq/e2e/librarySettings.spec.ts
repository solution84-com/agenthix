import { test, expect } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'
import { at } from './fixtures/address'

// Library and skills, in the admin area's Settings group (skills spec parts 3 and 4, board R2). Written against the
// seeded e2e organisation; run by the lead against a running hq.

test.use({ viewport: { width: 1280, height: 800 } })

test('is in the Settings group of the admin menu @SC-1616', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/admin')
  await page.getByRole('link', { name: 'Library and skills' }).first().click()
  await expect(page).toHaveURL(at('/admin/settings/library'))
  await expect(page.getByRole('heading', { level: 1, name: 'Library and skills' })).toBeVisible()
})

test('holds each setting the design gives an administrator @SC-1616', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/admin/settings/library')
  for (const name of ['Trusted publishers', 'Unsigned assets', 'Who may install from outside', 'Skills found in files', 'Personal skills outside Your space', 'Library maintainers']) {
    await expect(page.getByRole('region', { name })).toBeVisible()
  }
  await expect(page.getByTestId('publishers')).toContainText('Agenthix')
  // A built-in skill's switch is in its own page's who-uses-it menu, not here.
  await expect(page.getByRole('region', { name: 'Built-in skills' })).toHaveCount(0)
})

test('asks before skills in files are on by default, and leaves the setting alone if it is not confirmed @SC-1616 @SC-1642', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/admin/settings/library')
  const off = page.getByRole('radio', { name: /Off by default/ })
  await expect(off).toBeChecked()
  await page.getByRole('radio', { name: /On by default/ }).click()
  const confirm = page.getByRole('dialog', { name: 'Turn skills in files on by default?' })
  await expect(confirm).toContainText('without anyone reviewing them first')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(off).toBeChecked()
})

test('shows what a Library maintainer reaches before anyone is named @SC-1617', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/admin/settings/library')
  const choose = page.getByLabel('Person to name')
  const options = await choose.locator('option').allTextContents()
  test.skip(options.length < 2, 'The seeded organisation has no member to name')
  await choose.selectOption({ index: 1 })
  await page.getByRole('button', { name: /Add a Library maintainer/ }).click()
  await expect(page.getByTestId('maintainer-reach')).toContainText("including ones they can't access")
  await page.getByRole('button', { name: 'Cancel' }).click()
})

test('is for administrators: a member is told so @SC-1617', async ({ page }) => {
  await signIn(page, MEMBER)
  await page.goto('/admin/settings/library')
  await expect(page.getByRole('status').filter({ hasText: 'Admins only' })).toBeVisible()
})
