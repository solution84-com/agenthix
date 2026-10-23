import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:model-access — Organisation › Settings › Model access, with the Add model access menu open.
test('model-access', async ({ page }) => {
  await capture(page, {
    path: '/admin/settings/model-access',
    before: (p) => p.getByRole('button', { name: /Add model access/ }).click(),
    ready: (p) => expect(p.getByRole('menu', { name: 'Add model access' })).toBeVisible(),
  })
})
