import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:chat-conversation — one of Sam's conversations with Kernel, open in the dock beside the Chat page.
test('chat-conversation', async ({ page }) => {
  await capture(page, {
    path: '/chat',
    before: (p) => p.getByTestId('inbox-row').filter({ hasText: 'Plan a first week for the new website' }).click(),
    ready: (p) => expect(p.getByRole('complementary', { name: 'Conversation' }).getByText('watch for broken links each morning', { exact: false })).toBeVisible(),
  })
})
