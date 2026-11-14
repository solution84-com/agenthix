import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:providers — Manage organisation › AI: What agents can do first, then Your providers, one line each with its
// state, one of them opened in place to show its key and what uses it.
test('providers', async ({ page }) => {
  await capture(page, {
    path: '/admin/ai',
    height: 800,
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'AI', exact: true })).toBeVisible()
      const list = p.getByRole('list', { name: 'Providers' })
      for (const name of ['Anthropic', 'OpenRouter', 'AssemblyAI', 'Inworld']) await expect(list.getByText(name).first()).toBeVisible()
      await expect(p.getByRole('heading', { name: 'What agents can do' })).toBeVisible()
      await list.getByRole('button', { name: /^Anthropic/ }).click()
      await expect(list.getByRole('button', { name: /^Anthropic/, expanded: true })).toBeVisible()
    },
  })
})
