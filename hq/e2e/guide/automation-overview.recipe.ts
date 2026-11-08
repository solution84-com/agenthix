import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:automation-overview — the Automation section of WEB: what runs now, and what will start later.
test('automation-overview', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=automation',
    ready: (p) => expect(p.getByRole('button', { name: /Routines/ })).toBeVisible(),
  })
})
