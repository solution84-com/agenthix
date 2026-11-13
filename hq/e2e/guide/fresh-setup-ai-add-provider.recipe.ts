import { expect, test } from '@playwright/test'
import { capture } from './capture'
import { createFirstAdmin } from './fresh'

// screenshot:setup-ai-add-provider — setup's AI step with the Add a provider pop-up open: every provider and what it
// covers. It makes the administrator the next recipes sign in as.
test('setup-ai-add-provider', async ({ page }) => {
  await createFirstAdmin(page)
  await capture(page, {
    as: null,
    path: '/setup?step=ai',
    before: async (p) => {
      await p.getByRole('button', { name: /Add a provider/ }).click()
    },
    ready: async (p) => {
      const list = p.getByRole('list', { name: 'Providers to add' })
      await expect(list.getByText('Anthropic', { exact: true })).toBeVisible()
      await expect(list.getByText('Agenthix Cloud')).toHaveCount(0)
    },
  })
})
