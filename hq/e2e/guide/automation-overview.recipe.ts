import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:automation-overview — the Automation section of WEB, whose automation is on.
test('automation-overview', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=automation',
    ready: (p) => expect(p.getByRole('button', { name: 'Pause', exact: true })).toBeVisible(),
  })
})
