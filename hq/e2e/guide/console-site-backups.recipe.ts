import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'
import { HQ_MACHINE } from './consoleSample'

// screenshot:console-site-backups — one machine's backups: the nights it can go back to, each with Restore….
test('console-site-backups', async ({ page }) => {
  await captureConsole(page, {
    path: `/backups/${HQ_MACHINE}`,
    height: 1100,
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: "HQ's backups" })).toBeVisible()
      await expect(p.getByRole('list', { name: 'Nights to restore' }).getByRole('listitem')).toHaveCount(7)
    },
  })
})
