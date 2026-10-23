import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:diagnostics — Organisation › Infrastructure › Logs and diagnostics: health now and recent errors.
// Health and the support bundle are shown to fleet admins, which the sample's Sam is (seed-guide-data.mjs).
test('diagnostics', async ({ page }) => {
  await capture(page, {
    path: '/admin/infrastructure/diagnostics',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: /^Health now/ })).toBeVisible()
      await expect(p.getByRole('link', { name: 'Download support bundle' })).toBeVisible()
    },
  })
})
