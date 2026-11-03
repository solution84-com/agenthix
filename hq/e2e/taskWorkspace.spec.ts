import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

/**
 * A new task's workspace on the task form (live preview spec, *Which work is code work*): with exactly one code
 * workspace in the project it is chosen, and the form says what the choice means. The project is any the e2e
 * administrator may work in (E2E_PROJECT_KEY); its workspaces are answered here, and nothing is created.
 */
const PROJECT_KEY = process.env.E2E_PROJECT_KEY

test.describe("the task form's workspace", () => {
  test.skip(!PROJECT_KEY, 'needs a project: set E2E_PROJECT_KEY')

  test("chooses the project's only code workspace, and says choosing the project's files leaves code work off a branch", async ({ page }) => {
    await signIn(page, ADMIN)
    await page.route('**/operations/get-task-workspaces', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json: {
      current: null, workspaces: [{ id: 'w-docs', name: 'docs', git: false }, { id: 'w-shop', name: 'shop-app', git: true }],
    } }) }))
    await page.goto(`/projects/${PROJECT_KEY}?tool=tasks`)
    await page.getByRole('main').getByRole('button', { name: 'New task' }).click()
    await page.getByLabel('New task title').fill('Free delivery over $50')
    await page.getByRole('button', { name: 'More details' }).click()
    const field = page.getByRole('combobox', { name: 'Workspace' })
    await expect(field).toHaveValue('w-shop')
    await expect(page.getByTestId('task-workspace-hint')).toContainText('a branch of their own in shop-app')
    await field.selectOption('')
    await expect(page.getByTestId('task-workspace-hint')).toContainText('If it changes code, choose shop-app.')
  })
})
