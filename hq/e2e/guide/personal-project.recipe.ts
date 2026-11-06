import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:personal-project — New project with Just you chosen: a project only Sam sees, filled in.
test('personal-project', async ({ page }) => {
  await capture(page, {
    path: '/projects',
    before: async (p) => {
      await p.getByRole('button', { name: 'New project', exact: true }).click()
      await p.getByLabel('Name', { exact: true }).fill('Tax return 2026')
      await p.getByLabel('Description (optional)').fill('Receipts, forms and figures for this year’s tax return.')
      await p.getByLabel(/Just you/).check()
    },
    ready: (p) => expect(p.getByRole('button', { name: 'Create project' })).toBeEnabled(),
  })
})
