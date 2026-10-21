import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:settings — Sam's Settings page, top to Devices and connections, in a window tall enough for all of it.
test('settings', async ({ page }) => {
  await capture(page, {
    path: '/settings',
    height: 2400,
    ready: (p) => expect(p.getByText('Devices and connections')).toBeVisible(),
  })
})
