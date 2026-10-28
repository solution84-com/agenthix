import { expect, test } from '@playwright/test'
import { capture } from './capture'
import { createFirstAdmin } from './fresh'

// screenshot:setup-ai-choice — setup's third step, how agents reach AI: Agenthix Cloud greyed with "Not available
// yet", Your own keys, and Later. It makes the administrator the next recipes sign in as.
test('setup-ai-choice', async ({ page }) => {
  await createFirstAdmin(page)
  await capture(page, {
    as: null,
    path: '/setup?step=choice',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'How will your agents reach AI?' })).toBeVisible()
      await expect(p.getByRole('region', { name: 'Agenthix Cloud' }).getByText('Not available yet')).toBeVisible()
    },
  })
})
