import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:usage — Manage organisation › Usage: the month's cost by project. The page opens on the server's current
// month, which the capture helper rewrites to the sample's.
test('usage', async ({ page }) => {
  await capture(page, {
    path: '/admin/usage',
    before: async (p) => {
      await p.getByLabel('Group by').selectOption('project')
    },
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: /^Usage · / })).toBeVisible()
      await expect(p.getByRole('columnheader', { name: 'Project' })).toBeVisible()
      await expect(p.getByRole('rowheader', { name: 'Website relaunch' })).toBeVisible()
    },
  })
})
