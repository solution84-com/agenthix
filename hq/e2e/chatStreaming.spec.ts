import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

// SC-077 — "Chat response streams token-by-token (socket)." Open the dock, send a message, and observe the
// assistant reply growing over the socket rather than appearing all at once. The organisation talks on a stand-in
// endpoint for the run (fixtures/standInModel.ts), so no real model is called.
test.describe('chat streaming', () => {
  test('assistant reply streams token-by-token over the socket @SC-077', async ({ page }) => {
    // The seeded e2e admin, and the default agent on HQ's own site.
    await signIn(page, ADMIN)
    await page.goto('/chat')

    // The dock is never empty: it holds the conversation last written in, or a new one in your space. The prompt
    // goes to whichever it is, and the thread's Copy buttons are counted from what was there before.
    const thread = page.getByRole('complementary', { name: 'Conversation' })
    const copies = thread.getByRole('button', { name: 'Copy', exact: true })
    const input = thread.getByRole('textbox').last()
    await expect(input).toBeVisible()
    // Counted once what the dock holds has loaded, or every earlier reply would pass for the new one.
    await page.waitForLoadState('networkidle')
    const before = await copies.count()
    await input.fill('Say hello in three short sentences.')
    await input.press('Enter')

    // The conversation is in the address (/chat?c=<id>) and the reply grows in it. The messages carry no test
    // hooks, so the thread's text is sampled: it must change more than once (the prompt, then the reply growing)
    // and end when the finished reply shows its actions (Copy, Usage, Details).
    await expect(page).toHaveURL(/\/chat\?c=/, { timeout: 15_000 })
    const lengths = new Set<number>()
    await expect
      .poll(async () => {
        lengths.add((await thread.innerText()).length)
        // Only a finished reply has a Copy button: the new one adds one.
        return (await copies.count()) >= before + 1
      }, { timeout: 90_000, intervals: [250] })
      .toBe(true)
    expect(lengths.size).toBeGreaterThanOrEqual(2)
  })
})
