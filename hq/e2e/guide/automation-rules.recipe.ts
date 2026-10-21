import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:automation-rules — the Rules view of WEB's Automation tool: its limits beside the organisation's.
test('automation-rules', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=automation&aview=rules',
    ready: (p) => expect(p.getByText('Columns that start work automatically')).toBeVisible(),
  })
})
