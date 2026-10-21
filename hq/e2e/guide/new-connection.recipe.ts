import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:new-connection — Settings › Connections, with the New connection form open and nothing saved.
test('new-connection', async ({ page }) => {
  await capture(page, {
    path: '/settings/connections',
    before: (p) => p.getByRole('button', { name: 'New connection' }).click(),
    ready: (p) => expect(p.getByText('Expires after')).toBeVisible(),
  })
})
