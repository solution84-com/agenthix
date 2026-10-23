import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:organisation-page — Sam's Organisation page: its identity and the workplace.
test('organisation-page', async ({ page }) => {
  await capture(page, {
    height: 1100,
    path: '/org',
    ready: async (p) => {
      await expect(p.getByText('The workplace').first()).toBeVisible()
    },
  })
})
