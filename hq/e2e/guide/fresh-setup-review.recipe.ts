import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:setup-review — setup's last look, for the administrator fresh-setup-model-access created.
test('setup-review', async ({ page }) => {
  await capture(page, {
    path: '/setup?step=review',
    ready: (p) => expect(p.getByRole('heading', { name: 'Check everything before you start' })).toBeVisible(),
  })
})
