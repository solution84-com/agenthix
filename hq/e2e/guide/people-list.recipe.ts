import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:people-list — Organisation › People: the waiting invitation above everyone in the organisation.
test('people-list', async ({ page }) => {
  await capture(page, {
    path: '/org/people',
    ready: async (p) => {
      await expect(p.getByText('Invited · waiting')).toBeVisible()
      await expect(p.getByText('Priya Nair').first()).toBeVisible()
    },
  })
})
