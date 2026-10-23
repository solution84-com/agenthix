import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:models — Manage organisation › Models: the default conversation and worker models, the default voice,
// and which models may run.
test('models', async ({ page }) => {
  await capture(page, {
    path: '/admin/models',
    height: 1300,
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Models', exact: true })).toBeVisible()
      await expect(p.getByRole('region', { name: 'Defaults' })).toBeVisible()
      await expect(p.getByText('via Anthropic').first()).toBeVisible()
    },
  })
})
