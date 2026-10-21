import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'

// screenshot:console-backups — Backups: HQ and each site, when each last backed up, and Back up now and Export for each.
test('console-backups', async ({ page }) => {
  await captureConsole(page, {
    path: '/backups',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Backups' })).toBeVisible()
      await expect(p.getByRole('article', { name: /office-server/ })).toBeVisible()
    },
  })
})
