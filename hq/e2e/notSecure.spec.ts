import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { REPLY } from './fixtures/standInModel'

// HQ opened over plain http at a network address, where the page is not a secure context: the `not-secure` project
// (playwright.config.ts) serves the same app at a made-up name that Chromium resolves to this machine. A browser
// leaves out crypto.randomUUID, the clipboard and the microphone there, and a send that froze for want of one once
// passed every test run at localhost. Needs what the other signed-in specs need: the seeded e2e admin; the organisation
// talks on the stand-in model (fixtures/standInModel.ts).

/** The page's uncaught errors, which a missing browser feature shows up as. */
function errorsOf(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

test.describe('HQ at a plain-http network address @SC-1146 @SC-1148', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN)
    // Without this the project would prove nothing: the page must be one a browser does not count as secure.
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false)
  })

  test('does not offer voice, then starts a conversation from Home and sends in it', async ({ page }) => {
    const errors = errorsOf(page)
    await page.goto('/')
    // The microphone cannot be had here, so the empty box's voice button is greyed, its reason in its name, and never
    // started: that it needs https or this computer, or hq's own reason first when this HQ has no voice at all.
    await expect(page.getByRole('button', { name: /^Start voice \(unavailable: .+\)$/ }).first()).toBeDisabled()

    const start = page.getByRole('textbox', { name: 'Ask any agent…' }).first()
    await start.fill('First words, over plain http.')
    await start.press('Enter')
    // The conversation opens beside Home (?c=<id>), or on its own page.
    await expect(page).toHaveURL(/[?&]c=[^&]+|\/chat\/t\/[^/?]+/, { timeout: 15_000 })
    const thread = page.getByRole('complementary', { name: 'Conversation' })
    await expect(thread.getByText('First words, over plain http.').first()).toBeVisible()
    await expect(thread.getByText(REPLY).first()).toBeVisible({ timeout: 60_000 })
    // Only a finished reply has a Copy button: the next message goes in once this one has ended.
    await expect(thread.getByRole('button', { name: 'Copy', exact: true }).first()).toBeVisible({ timeout: 60_000 })

    // A second message, through the open conversation's own box.
    const box = thread.getByRole('textbox').last()
    await box.fill('And a second one.')
    await box.press('Enter')
    await expect(thread.getByText('And a second one.').first()).toBeVisible({ timeout: 15_000 })
    expect(errors).toEqual([])
  })

  test('copies the pairing link without the clipboard, or says it could not', async ({ page }) => {
    const errors = errorsOf(page)
    await page.goto('/settings/mobile')
    await page.getByRole('button', { name: 'Generate QR Code' }).click()
    // The page's own Copy: the docked conversation beside it has a Copy on each finished reply.
    const main = page.getByRole('main')
    await main.getByRole('button', { name: 'Copy', exact: true }).click()
    await expect(main.getByRole('button', { name: /^(Copied!|Could not copy: select the text)$/ })).toBeVisible()
    expect(errors).toEqual([])
  })
})
