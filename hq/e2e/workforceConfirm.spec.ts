import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

// SC-189 — "Confirming a reviewed agent-proposed workforce proposal returns the
// user to /org on success." A UI flow: open a pending workforce-assembly review
// task, confirm it, and verify the app navigates back to /org.
//
// This spec documents the intended browser flow. It is not run in CI here (it
// needs a seeded in_review workforce-assembly task fixture); it captures the
// steps a fixtured run would take.
test.describe('workforce proposal confirm', () => {
  test('confirming a reviewed proposal navigates back to /org @SC-189', async ({ page }) => {
    // Precondition (fixture): a Team proposal in review in the Workforce Assembly project; set E2E_REVIEW_TASK_ID.
    const id = process.env.E2E_REVIEW_TASK_ID
    test.skip(!id, 'needs an in_review workforce-assembly task: set E2E_REVIEW_TASK_ID')
    await signIn(page, ADMIN)
    // The review link propose_workforce_template writes; the page reads the template from the task.
    await page.goto(`/workforce-templates/review?taskId=${id}`)

    // Confirm the reviewed selections.
    await page.getByRole('button', { name: /confirm|apply/i }).first().click()

    // On success the user is returned to the org overview.
    await page.waitForURL(/\/org$/)
    expect(page.url()).toMatch(/\/org$/)
  })
})
