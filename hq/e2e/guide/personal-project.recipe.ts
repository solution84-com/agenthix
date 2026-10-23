import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:personal-project — New project, for Sam, who is an organisation admin and so is first asked whether it is
// just for them or for the organisation: the form for a project only Sam sees, filled in.
test('personal-project', async ({ page }) => {
  await capture(page, {
    path: '/projects',
    before: async (p) => {
      await p.getByRole('button', { name: 'New project', exact: true }).click()
      await p.getByRole('button', { name: /Just for you/ }).click()
      await p.getByLabel('Name', { exact: true }).fill('Tax return 2026')
      await p.getByLabel('Description').fill('Receipts, forms and figures for this year’s tax return.')
    },
    ready: (p) => expect(p.getByRole('button', { name: 'Make it' })).toBeEnabled(),
  })
})
