import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { at } from './fixtures/address'

// The Secrets and variables screens (workflows spec part 5, U1 and U6): the entry in a place's panel, the two tabs
// with the same columns, the Add forms, and the phone view. Your space is the place used, since every person has one
// and administers it. Nothing here saves a value: the forms are opened and closed, and a value is never typed.

const sections = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('list', { name: 'Your space sections' })

test.describe('Secrets and variables on a wide window', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN)
  })

  test('the panel has the entry, and it opens the section @SC-1335', async ({ page }) => {
    await page.goto('/space')
    await sections(page).getByRole('link', { name: /^Secrets and variables/ }).click()
    await expect(page).toHaveURL(at('/space?tool=secrets'))
    await expect(sections(page).getByRole('link', { name: /^Secrets and variables/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('tab', { name: /^Secrets/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: /^Variables/ })).toBeVisible()
  })

  test('the rotation notice’s address opens the section @SC-1331', async ({ page }) => {
    await page.goto('/space/secrets')
    await expect(page).toHaveURL(at('/space?tool=secrets'))
    await expect(page.getByRole('tab', { name: /^Secrets/ })).toBeVisible()
  })

  test('the Variables tab is in the address and has its own add button @SC-1335', async ({ page }) => {
    await page.goto('/space?tool=secrets')
    await page.getByRole('tab', { name: /^Variables/ }).click()
    await expect(page).toHaveURL(/stab=variables/)
    await expect(page.getByRole('button', { name: 'Add a variable' })).toBeVisible()
  })

  test('Add a secret asks what it is, where to get a new one and the value, and refuses an empty form @SC-1335', async ({ page }) => {
    await page.goto('/space?tool=secrets')
    await page.getByRole('button', { name: 'Add a secret' }).click()
    const form = page.getByTestId('add-secret-dialog')
    for (const label of ['Name', 'What it is and what it reaches', 'Where to get a new one', 'Value', 'Rotate by']) {
      await expect(form.getByText(label, { exact: true })).toBeVisible()
    }
    await form.getByRole('button', { name: 'File' }).click()
    await expect(form.getByText(/Up to 48 KB/)).toBeVisible()
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(form.getByText('Say what it is and what it reaches.')).toBeVisible()
    await form.getByRole('button', { name: 'Cancel' }).click()
    await expect(form).toBeHidden()
  })
})

test.describe('Secrets and variables on a phone @SC-1335', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the section has no horizontal scroll and the form fits', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/space?tool=secrets')
    await expect(page.getByRole('tab', { name: /^Secrets/ })).toBeVisible()
    await page.getByRole('button', { name: 'Add a secret' }).click()
    await expect(page.getByTestId('add-secret-dialog')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
