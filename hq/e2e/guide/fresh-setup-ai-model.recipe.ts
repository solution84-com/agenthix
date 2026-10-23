import { expect, test } from '@playwright/test'
import { capture } from './capture'
import { addProvider } from '../fixtures/voiceProviders'

// screenshot:setup-ai-model — setup's Your model provider step with OpenRouter chosen and its key typed in (hidden).
// Saving asks the vendor, which a recipe must not, so it saves nothing: the provider is put in the database as HQ
// would have stored it (fixtures/add-provider.mjs), which the next recipes build on.
test('setup-ai-model', async ({ page }) => {
  await capture(page, {
    path: '/setup?step=model&path=keys',
    before: async (p) => {
      await p.getByRole('button', { name: /^OpenRouter/ }).click()
      await p.getByLabel(/^api key/i).fill('sk-or-guide-sample-not-a-key')
    },
    ready: (p) => expect(p.getByRole('heading', { name: 'Add OpenRouter' })).toBeVisible(),
  })
  addProvider('openrouter')
})
