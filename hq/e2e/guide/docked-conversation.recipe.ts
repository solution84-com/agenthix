import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:docked-conversation — a conversation opened from Chat stays docked on the right while the page changes to Your tasks.
test('docked-conversation', async ({ page }) => {
  await capture(page, {
    path: '/chat',
    before: async (p) => {
      await p.getByTestId('inbox-row').filter({ hasText: 'Plan a first week for the new website' }).click()
      await expect(p.getByTestId('dock')).toBeVisible()
      await p.getByRole('link', { name: /^Your tasks/ }).first().click()
    },
    ready: async (p) => {
      await expect(p).toHaveURL(/\/tasks\?c=/)
      await expect(p.getByRole('complementary', { name: 'Conversation' }).getByText('watch for broken links each morning', { exact: false })).toBeVisible()
    },
  })
})
