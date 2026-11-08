import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

/**
 * A task's page opens and draws without an error (TK1): the project's first task opens with its
 * title, its tabs Comments, Runs and Activity, and Runs opens when chosen; its header has its type and its column as
 * chips that open their menus, and ⋯ moves it in the project's order. New task picks a type and starts in Backlog. The
 * project is any the e2e administrator may work in (E2E_PROJECT_KEY); nothing is created or changed.
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

  test('has its type and column in the header, each a chip that opens its menu, and Move to top in ⋯', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.goto(`/tasks/${PROJECT_KEY}-1`)
    test.skip(await page.getByText('This task doesn’t exist any more').isVisible().catch(() => false), 'needs task 1 in the project')
    const header = page.getByRole('banner', { name: 'Task' })
    await header.getByRole('button', { name: /^Type: / }).click()
    await expect(page.getByRole('menu', { name: 'Type' }).getByRole('menuitemradio', { name: /Epic/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await header.getByRole('button', { name: /^Column: / }).click()
    await expect(page.getByRole('menu', { name: 'Column' }).getByRole('menuitemradio', { checked: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await header.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Move to top' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /epic/i })).toHaveCount(0)
  })

  test('on a phone, keeps the chips in the row and the actions behind the top bar’s ⋯', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/tasks/${PROJECT_KEY}-1`)
    test.skip(await page.getByText('This task doesn’t exist any more').isVisible().catch(() => false), 'needs task 1 in the project')
    const header = page.getByRole('banner', { name: 'Task' })
    const column = header.getByRole('button', { name: /^Column: / })
    await expect(column).toBeVisible()
    expect((await column.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect(header.getByRole('button', { name: 'More actions' })).toBeHidden()
    await page.getByTestId('mobile-header').getByRole('button', { name: 'Actions for this screen' }).click()
    await expect(page.getByRole('menuitem', { name: 'Copy link' })).toBeVisible()
  })

  test('New task picks Task and starts it in its type’s Backlog column, at the top right Create task', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.goto(`/projects/${PROJECT_KEY}/tasks/new`)
    const types = page.getByRole('radiogroup', { name: 'Type' })
    await expect(types.getByRole('radio', { name: 'Task' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('new-task-column')).toHaveText('Starts in Backlog')
    await expect(page.getByRole('banner', { name: 'New task' }).getByRole('button', { name: 'Create task' })).toBeDisabled()
  })
})
