import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'

// screenshot:console-dashboard — the Fleet Console's Dashboard: HQ as the hub, with each site and its state.
test('console-dashboard', async ({ page }) => {
  await captureConsole(page, {
    path: '/',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
      await expect(p.getByText('laptop-dana').first()).toBeVisible()
      await expect(p.getByText('Not heard from').first()).toBeVisible()
    },
  })
})
