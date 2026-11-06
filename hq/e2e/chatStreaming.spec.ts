import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { REPLY } from './fixtures/standInModel'

// SC-077 — "Chat response streams token-by-token (socket)." Open the dock, send a message, and observe the
// assistant reply growing over the socket rather than appearing all at once. The organisation talks on a stand-in
// endpoint for the run (fixtures/standInModel.ts), so no real model is called.
test.describe('chat streaming', () => {
  test('assistant reply streams token-by-token over the socket @SC-077', async ({ page }) => {
    // The waits below stay inside this limit, so a missing reply fails on its own wait and says what it waited for.
    test.setTimeout(60_000)
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
    // model of an earlier run that is gone, and the thread holds nothing an earlier run left.
    const thread = page.getByRole('complementary', { name: 'Conversation' })
    await page.waitForLoadState('networkidle')
    // The chat's bar starts minimised. With nothing open, the panel fills itself with a new conversation; over an
    // open one, Talk opens a new one as a dialog.
    const filledWithDraft = (await thread.getByTestId('dock-draft').count()) > 0
    await page.getByTestId('screen-bar').getByRole('button', { name: 'Talk in your space' }).click()
    const draft = filledWithDraft ? thread.getByTestId('dock-draft') : page.getByRole('dialog', { name: 'New conversation' })
    const input = draft.getByRole('textbox', { name: 'Ask any agent…' })
    await expect(input).toBeVisible()
    await input.fill('Say hello in three short sentences.')
    await expect(draft.getByRole('button', { name: 'Send' })).toBeEnabled()
    await input.press('Enter')

    // The conversation is in the address (/chat?c=<id>), the reply is the stand-in's own words, and it ends when the
    // finished reply shows its actions (Copy, Usage, Details).
    await expect(page).toHaveURL(/\/chat\?c=/, { timeout: 15_000 })
    await expect(thread.getByText(REPLY).first()).toBeVisible({ timeout: 30_000 })
    await expect(thread.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(1, { timeout: 10_000 })
    expect(deltas).toBeGreaterThanOrEqual(2)
  })
})
