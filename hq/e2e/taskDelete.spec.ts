import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

// SC-175 — Delete… on a task's page asks once, in a dialog that names the task and what goes with it, and offers
// archiving instead; only Delete task deletes, and the person lands on the project's Tasks list. The server's
// deleteTask performs no confirmation of its own (proven at the integration level by deleteTask @SC-039).
//
// Signs in as the seeded e2e admin and needs a disposable task: set E2E_TASK_KEY to its key. The task page is
// /tasks/<key>; Delete… is in the task's "More actions" menu.

const TASK_KEY = process.env.E2E_TASK_KEY

test.describe('task delete confirmation @SC-175', () => {
  test('Delete… opens the dialog; Cancel keeps the task; Delete task deletes it', async ({ page }) => {
    test.skip(!TASK_KEY, 'deletes a task: set E2E_TASK_KEY to a disposable task')
    await signIn(page, ADMIN)
    await page.goto(`/tasks/${TASK_KEY}`)

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete…' }).click()
    const dialog = page.getByRole('dialog', { name: `Delete ${TASK_KEY}?` })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('This can’t be undone.', { exact: false })).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    expect(page.url()).toContain(TASK_KEY!)

    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete…' }).click()
    await page.getByRole('dialog', { name: `Delete ${TASK_KEY}?` }).getByRole('button', { name: 'Delete task' }).click()
    await expect(page).toHaveURL(new RegExp(`/projects/${TASK_KEY!.split('-')[0]}/tasks$`))

    await page.goto(`/tasks/${TASK_KEY}`)
    await expect(page.getByRole('heading', { name: 'This task doesn’t exist any more' })).toBeVisible()
  })
})
