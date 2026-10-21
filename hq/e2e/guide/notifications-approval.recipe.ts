import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:notifications-approval — the Notifications panel, with Writer's request on WEB-2 under Needs you.
test('notifications-approval', async ({ page }) => {
  // Opening the panel marks what it shows as seen; a recipe saves nothing, so the other recipes still find the bell counting both.
  await page.route('**/operations/mark-notifications-read', (route) => route.abort())
  await capture(page, {
    path: '/projects/WEB',
    before: (p) => p.getByRole('button', { name: /^Notifications/ }).click(),
    ready: (p) => expect(p.getByRole('dialog', { name: 'Notifications' }).getByText('Needs you').first()).toBeVisible(),
  })
})
