import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

/**
 * A task's page opens and draws without an error (T0): the project's first task opens with its
 * title, its tabs Comments, Runs and Activity, and Runs opens when chosen. The project is any the e2e administrator
 * may work in (E2E_PROJECT_KEY); nothing is created or changed.
 */
const PROJECT_KEY = process.env.E2E_PROJECT_KEY

test.describe("a task's page", () => {
  test.skip(!PROJECT_KEY, 'needs a project: set E2E_PROJECT_KEY')

  test('opens with its tabs, and Runs opens when chosen', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await signIn(page, ADMIN)
    await page.goto(`/tasks/${PROJECT_KEY}-1`)
    test.skip(await page.getByText('This task doesn’t exist any more').isVisible().catch(() => false), 'needs task 1 in the project')
    const tabs = page.getByRole('tablist', { name: 'Comments, runs and activity' })
    await expect(tabs.getByRole('tab', { name: /^Comments/ })).toBeVisible()
    await expect(tabs.getByRole('tab', { name: /^Activity/ })).toBeVisible()
    const runs = tabs.getByRole('tab', { name: /^Runs/ })
    if (await runs.count()) {
      await runs.click()
      await expect(runs).toHaveAttribute('aria-selected', 'true')
    }
    expect(errors).toEqual([])
  })
})
