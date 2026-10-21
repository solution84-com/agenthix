import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'

// screenshot:console-add-site-confirm — Add a site, step 2: the new machine's name and fingerprint, to compare before confirming.
test('console-add-site-confirm', async ({ page }) => {
  await captureConsole(page, {
    path: '/fleet/add',
    join: 'confirming',
    before: (p) => p.getByRole('button', { name: 'Continue' }).click(),
    ready: async (p) => {
      await expect(p.getByText('Step 2 of 2')).toBeVisible()
      await expect(p.getByRole('button', { name: 'Confirm build-box' })).toBeVisible()
    },
  })
})
