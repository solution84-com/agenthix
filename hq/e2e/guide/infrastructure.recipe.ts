import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:infrastructure — Organisation › Infrastructure: HQ, Execution Sites, Storage and More.
test('infrastructure', async ({ page }) => {
  await capture(page, {
    height: 1100,
    path: '/admin/infrastructure',
    ready: (p) => expect(p.getByText('Logs and diagnostics').first()).toBeVisible(),
  })
})
