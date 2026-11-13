import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:runs-screen — Sam's Runs screen: the groups across the top and the list, with the run waiting for their okay in it.
test('runs-screen', async ({ page }) => {
  await capture(page, {
    path: '/runs',
    ready: async (p) => {
      await expect(p.getByRole('group', { name: 'Show runs' })).toBeVisible()
      await expect(p.getByText('Wants your okay').first()).toBeVisible()
    },
  })
})
