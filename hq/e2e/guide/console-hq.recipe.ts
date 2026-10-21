import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'

// screenshot:console-hq — the Fleet Console's HQ page: how people reach HQ, its version and backups, and the machine it runs on.
test('console-hq', async ({ page }) => {
  await captureConsole(page, {
    path: '/hq',
    height: 1100,
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: "Fernhill & Co's HQ" })).toBeVisible()
      await expect(p.getByText('The machine HQ runs on')).toBeVisible()
    },
  })
})
