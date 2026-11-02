import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

// SC-077 — "Chat response streams token-by-token (socket)." Open the dock, send a message, and observe the
// assistant reply growing over the socket rather than appearing all at once. The organisation talks on a stand-in
// endpoint for the run (fixtures/standInModel.ts), so no real model is called.
test.describe('chat streaming', () => {
  test('assistant reply streams token-by-token over the socket @SC-077', async ({ page }) => {
    // The seeded e2e admin, and the default agent on HQ's own site.
    await signIn(page, ADMIN)
    // The reply's pieces, as the socket carries them: the stand-in answers in a moment, faster than the thread's
    // text could be sampled, so its growth is counted where it arrives.
    let deltas = 0
    page.on('websocket', (ws) => ws.on('framereceived', ({ payload }) => {
      if (typeof payload === 'string' && payload.includes('"conversation:delta"')) deltas += 1
    }))
    await page.goto('/chat')

    // A new conversation, so the reply comes from the model the run talks on: the one the dock last held may name a
    // model of an earlier run that is gone. Copy buttons are counted from what the dock shows once it has loaded.
    const thread = page.getByRole('complementary', { name: 'Conversation' })
    await page.waitForLoadState('networkidle')
    await thread.getByRole('button', { name: 'New conversation' }).click()
    const copies = thread.getByRole('button', { name: 'Copy', exact: true })
    const input = thread.getByRole('textbox', { name: 'Ask any agent…' })
    await expect(input).toBeVisible()
    const before = await copies.count()
    await input.fill('Say hello in three short sentences.')
    await input.press('Enter')

    // The conversation is in the address (/chat?c=<id>), the reply arrives in more than one piece, and it ends when
    // the finished reply shows its actions (Copy, Usage, Details).
    await expect(page).toHaveURL(/\/chat\?c=/, { timeout: 15_000 })
    await expect(copies).toHaveCount(before + 1, { timeout: 90_000 })
    expect(deltas).toBeGreaterThanOrEqual(2)
  })
})
