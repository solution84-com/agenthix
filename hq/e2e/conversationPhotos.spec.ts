import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { REPLY } from './fixtures/standInModel'

// Photos and files in a conversation: ＋ › Photo or file adds a picture to the box's tray, sending keeps it in the
// place's Shared in conversations/ and shows it in the message, and the model is given it (the stand-in counts the
// pictures it sees). A provider that refuses the picture is asked again without it, and the message says so. The
// organisation talks on the stand-in endpoint (fixtures/standInModel.ts), a model nobody knows takes images, so the
// picture is sent. Needs a site that answers for the administrator's own space.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function openConversation(page: Page) {
  await signIn(page, ADMIN)
  await page.goto('/chat')
  await page.waitForLoadState('networkidle')
  const thread = page.getByRole('complementary', { name: 'Conversation' })
  const filledWithDraft = (await thread.getByTestId('dock-draft').count()) > 0
  await page.getByTestId('chat-list-header').getByRole('button', { name: 'New conversation' }).click()
  const draft = filledWithDraft ? thread.getByTestId('dock-draft') : page.getByRole('dialog', { name: 'New conversation' })
  const input = draft.getByRole('textbox', { name: 'Ask any agent…' })
  await input.fill('Hello.')
  // Enter sends only once the box has its agent and model, as chatStreaming.spec.ts waits for too.
  await expect(draft.getByRole('button', { name: 'Send' })).toBeEnabled()
  await input.press('Enter')
  await expect(page).toHaveURL(/\/chat\?c=/, { timeout: 15_000 })
  await expect(thread.getByText(REPLY).first()).toBeVisible({ timeout: 30_000 })
  return thread
}

async function addPicture(page: Page, thread: ReturnType<Page['getByRole']>, name: string) {
  await thread.getByRole('button', { name: 'Add' }).click()
  const chooser = page.waitForEvent('filechooser')
  await thread.getByRole('menuitem', { name: /Photo or file/ }).click()
  await (await chooser).setFiles({ name, mimeType: 'image/png', buffer: PNG })
  await expect(thread.getByTestId('shared-tray').getByRole('img', { name })).toBeVisible()
}

test.describe('photos and files in a conversation', () => {
  test('a picture added with ＋ is kept, shown in the message and given to the model', async ({ page }) => {
    test.setTimeout(90_000)
    const thread = await openConversation(page)
    await addPicture(page, thread, 'e2e-shot.png')
    await thread.getByRole('button', { name: 'Send' }).click()

    await expect(thread.getByTestId('shared-in-message').last()).toContainText('e2e-shot', { timeout: 20_000 })
    await expect(thread.getByTestId('shared-tray')).toHaveCount(0)
    await expect(thread.getByText(`${REPLY} It sees 1 image.`)).toBeVisible({ timeout: 30_000 })
  })

  test('a provider that refuses the picture is asked again without it, and the message says so', async ({ page }) => {
    test.setTimeout(90_000)
    const thread = await openConversation(page)
    await addPicture(page, thread, 'e2e-refused.png')
    const input = thread.getByRole('textbox').last()
    await input.fill('stand-in: refuse images')
    await thread.getByRole('button', { name: 'Send' }).click()

    await expect(thread.getByTestId('unseen-note')).toContainText("couldn't see the image", { timeout: 30_000 })
    await expect(thread.getByText(REPLY).last()).toBeVisible()
  })
})
