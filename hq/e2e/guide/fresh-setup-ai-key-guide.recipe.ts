import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:setup-ai-key-guide — the key form for Anthropic, with the short guide to getting a key above its fields
// and a key typed in (hidden). Saving asks the vendor, which a recipe must not, so nothing is saved.
test('setup-ai-key-guide', async ({ page }) => {
  await capture(page, {
    as: null,
    path: '/setup?step=ai',
    before: async (p) => {
      await p.getByRole('button', { name: /Add a provider/ }).click()
      await p.getByRole('button', { name: /^Anthropic/ }).click()
      await p.getByLabel(/^api key/i).fill('sk-ant-guide-sample-not-a-key')
    },
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Where do I get an Anthropic key?' })).toBeVisible()
      await expect(p.getByRole('link', { name: /Open Anthropic.s key page/ })).toBeVisible()
    },
  })
})
