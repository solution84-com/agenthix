import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:models — Manage organisation › AI with Which models may run open: the organisation's list, folded until
// a link or a press opens it. /admin/models opens the page at that section.
test('models', async ({ page }) => {
  await capture(page, {
    path: '/admin/models',
    height: 2400,
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'AI', exact: true })).toBeVisible()
      await expect(p.getByRole('button', { name: 'Which models may run', expanded: true })).toBeVisible()
      await expect(p.getByRole('region', { name: 'What agents can do' })).toBeVisible()
    },
  })
})
