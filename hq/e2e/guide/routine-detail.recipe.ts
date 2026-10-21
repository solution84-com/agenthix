import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:routine-detail — QTR's routine "Weekly status summary", opened from the Routines view.
test('routine-detail', async ({ page }) => {
  await capture(page, {
    path: '/projects/QTR?tool=automation&aview=routines',
    before: (p) => p.getByRole('button', { name: /^Weekly status summary/ }).click(),
    ready: (p) => expect(p.getByText('What it creates')).toBeVisible(),
  })
})
