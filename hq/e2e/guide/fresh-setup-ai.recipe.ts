import { expect, test } from '@playwright/test'
import { capture } from './capture'
import { addProvider } from '../fixtures/voiceProviders'

// screenshot:setup-ai — setup's AI step with Inworld added: its card with what it covers, and what agents use below.
// A key is checked with its vendor when saved, which a recipe must not reach, so the provider is put in the database as
// HQ would have stored it (fixtures/add-provider.mjs), which the last look's recipe builds on. The guide's HQ runs with
// the flag for Inworld's models on, so its card shows Models, Hearing and Speaking.
test('setup-ai', async ({ page }) => {
  addProvider('inworld')
  await capture(page, {
    as: null,
    path: '/setup?step=ai',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Connect AI' })).toBeVisible()
      await expect(p.getByText('Works. Added by you.')).toBeVisible()
      await expect(p.getByRole('region', { name: 'What agents use' })).toBeVisible()
    },
  })
})
