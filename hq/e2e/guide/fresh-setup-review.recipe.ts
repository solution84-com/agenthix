import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:setup-review — setup's last look, for the administrator and organisation the recipes before it made.
test('setup-review', async ({ page }) => {
  await capture(page, {
    path: '/setup?step=review',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Check everything before you start' })).toBeVisible()
      await expect(p.getByText('Inworld', { exact: true })).toBeVisible()
      await expect(p.getByText('Web search')).toBeVisible()
    },
  })
})
