import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:secrets-add — Website relaunch's Secrets and variables tool with the Add a secret form filled in.
// The form is never saved, and the value is made up.
test('secrets-add', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=secrets',
    before: async (p) => {
      await p.getByRole('button', { name: 'Add a secret' }).first().click()
      const form = p.getByTestId('add-secret-dialog')
      await form.getByLabel('Name', { exact: true }).fill('STAGING_DEPLOY_KEY')
      await form.getByLabel('What it is and what it reaches').fill('The key the website uploads with, for the staging server only')
    },
    ready: (p) => expect(p.getByTestId('add-secret-dialog')).toBeVisible(),
  })
})
