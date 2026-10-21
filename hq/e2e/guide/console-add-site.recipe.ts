import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'

// screenshot:console-add-site — Add a site, step 1: the one-time code and the command the machine admin runs on the new machine.
test('console-add-site', async ({ page }) => {
  await captureConsole(page, {
    path: '/fleet/add',
    join: 'waiting',
    before: (p) => p.getByRole('button', { name: 'Continue' }).click(),
    ready: async (p) => {
      await expect(p.getByLabel('One-time code')).toHaveText('K7QM-4XPD-93TB')
      await expect(p.getByText('Waiting for the machine to connect')).toBeVisible()
    },
  })
})
