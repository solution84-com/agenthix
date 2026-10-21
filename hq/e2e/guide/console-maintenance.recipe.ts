import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'

// screenshot:console-maintenance — Maintenance: what is planned across HQ and the sites, and what was done in the last 30 days.
test('console-maintenance', async ({ page }) => {
  await captureConsole(page, {
    path: '/maintenance',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Maintenance' })).toBeVisible()
      await expect(p.getByRole('article', { name: 'Upgrade office-server to 0.3.0' })).toBeVisible()
    },
  })
})
