import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:providers — Manage organisation › Providers: where the organisation's models and voice come from, each
// line with its state and what uses it.
test('providers', async ({ page }) => {
  await capture(page, {
    path: '/admin/providers',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Providers', exact: true })).toBeVisible()
      const list = p.getByRole('list', { name: 'Providers' })
      for (const name of ['Anthropic', 'OpenRouter', 'AssemblyAI', 'Inworld']) await expect(list.getByText(name).first()).toBeVisible()
    },
  })
})
