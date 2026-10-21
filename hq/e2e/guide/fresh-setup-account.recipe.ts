import { expect, test } from '@playwright/test'
import { capture } from './capture'
import { fillAccount, firstAdminLink } from './fresh'

// screenshot:setup-account — the first-admin link's page, filled in, before Continue.
test('setup-account', async ({ page }) => {
  await capture(page, {
    as: null,
    path: firstAdminLink(),
    before: fillAccount,
    ready: (p) => expect(p.getByRole('heading', { name: 'Set up Agenthix for your organisation' })).toBeVisible(),
  })
})
