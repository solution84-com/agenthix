import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:automation-settings — Organisation › Settings › Automation: what projects' automation may do.
test('automation-settings', async ({ page }) => {
  await capture(page, {
    path: '/org/settings/automation',
    ready: (p) => expect(p.getByText('Automation allowed')).toBeVisible(),
  })
})
