import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:routine-detail — QTR's routine "Weekly status summary", opened from the project's Routines.
test('routine-detail', async ({ page }) => {
  await capture(page, {
    path: '/projects/QTR?tool=routines',
    before: (p) => p.getByRole('link', { name: 'Weekly status summary' }).first().click(),
    ready: (p) => expect(p.getByText(/Summarise what moved/)).toBeVisible(),
  })
})
