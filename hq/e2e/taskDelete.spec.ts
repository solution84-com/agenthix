import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

// SC-175 — "Deleting a task requires a second confirming click (the button arms
// to 'Confirm'); the server deleteTask performs no confirmation of its own."
//
// The two-click arming lives in the task-detail UI (useTaskDetail.handleDelete:
// the first click sets confirmDelete and returns; only the second click calls
// deleteTask). That is a pure UI flow, so it is asserted here at the e2e level.
// The server half (deleteTask deletes unconditionally, no confirmation gate) is
// proven at the integration level by deleteTask @SC-039.
//
// This spec is authored to document the contract; it is not part of the gating
// run (e2e need not run/pass for F-017c) and signs in as the seeded e2e admin and
// needs a disposable task: set E2E_TASK_KEY to its key. The task page is /tasks/<key>; Delete is
// in the task's "More actions" menu, and its second click is labelled "Confirm: delete".

const TASK_KEY = process.env.E2E_TASK_KEY

test.describe('task delete confirmation @SC-175', () => {
  test('first Delete click arms to Confirm; only the second click deletes', async ({ page }) => {
    test.skip(!TASK_KEY, 'deletes a task: set E2E_TASK_KEY to a disposable task')
    await signIn(page, ADMIN)
    await page.goto(`/tasks/${TASK_KEY}`)
    await page.getByRole('button', { name: 'More actions' }).click()

    const deleteButton = page.getByRole('menuitem', { name: /^delete$/i })
    await expect(deleteButton).toBeVisible()

    // First click arms — the button relabels to "Confirm" and the task is NOT
    // yet deleted (still on the task page).
    await deleteButton.click()
    const confirmButton = page.getByRole('menuitem', { name: /confirm: delete/i })
    await expect(confirmButton).toBeVisible()
    expect(page.url()).toContain(TASK_KEY!)

    // Second click performs the delete and navigates away from the task page.
    await confirmButton.click()
    await expect(page).not.toHaveURL(new RegExp(TASK_KEY!))
  })
})
