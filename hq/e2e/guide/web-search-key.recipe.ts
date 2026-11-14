import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:web-search-key — the Web search for OpenCode pop-up, opened from Add a key on the AI page's Web search
// line. The sample runs Claude Code and OpenCode agents and holds no search key, so the line offers it. Nothing is
// saved.
test('web-search-key', async ({ page }) => {
  await capture(page, {
    path: '/admin/ai#web-search',
    before: async (p) => {
      await p.getByRole('button', { name: 'Add a key: Web search' }).click()
    },
    ready: async (p) => {
      const dialog = p.getByRole('dialog', { name: 'Web search for OpenCode' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByLabel('Exa API key')).toBeVisible()
    },
  })
})
