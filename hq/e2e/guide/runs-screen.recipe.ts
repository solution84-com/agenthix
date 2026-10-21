import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:runs-screen — Sam's Runs screen: the groups, with the newest run open beside the list.
test('runs-screen', async ({ page }) => {
  await capture(page, {
    path: '/runs',
    ready: async (p) => {
      await expect(p.getByText('Waiting for you').first()).toBeVisible()
      await expect(p.getByRole('heading', { name: /^Tool calls/ })).toBeVisible()
    },
  })
})
