import { test, expect, type Page } from '@playwright/test'
import { signIn, MEMBER } from './fixtures/auth'

/**
 * Places in a conversation (agent knowledge spec, part 4 and screens C3; walkthrough D5 and D6): the header lists the
 * places a conversation reaches, a person adds one (once told what that lets the agent do) or removes it with its
 * cross, the lead's card asking for a place is answered with a click, and a phone shows the count and opens a sheet.
 *
 * seed-e2e-knowledge.mjs makes the e2e operator's own conversation, with the lead's card already in it, and a project
 * the operator is a Member of (E2E_PLACES_CONVERSATION_ID, E2E_PLACES_PROJECT_NAME). The card is stored the way the
 * lead's suggest_place leaves it: the stand-in model answers every message with the same words and calls no tools, so
 * the lead's own offer is proved by the model checks and the server tests, and this spec proves the screens.
 * The tests run in order and leave the conversation holding only its own place.
 */
const CONVERSATION = process.env.E2E_PLACES_CONVERSATION_ID
const PLACE = process.env.E2E_PLACES_PROJECT_NAME

const places = (page: Page) => page.getByTestId('conversation-places')
const added = (page: Page) => places(page).getByTestId('place-added').filter({ hasText: PLACE! })
const card = (page: Page) => page.getByTestId('suggest-place-card')

async function openConversation(page: Page): Promise<void> {
  await signIn(page, MEMBER)
  await page.goto(`/chat/t/${CONVERSATION}`)
  await expect(places(page)).toBeVisible({ timeout: 20_000 })
}

async function removeIfAdded(page: Page): Promise<void> {
  if ((await added(page).count()) > 0) {
    await added(page).getByRole('button', { name: `Remove ${PLACE}` }).click()
    await expect(added(page)).toHaveCount(0)
  }
}

test.describe('places in a conversation', () => {
  test.skip(!CONVERSATION || !PLACE, 'needs the operator\'s conversation: run seed-e2e-knowledge.mjs and set E2E_PLACES_CONVERSATION_ID and E2E_PLACES_PROJECT_NAME')
  test.describe.configure({ mode: 'serial' })

  test('the header lists the conversation\'s own place first, with no cross to remove it @SC-1441', async ({ page }) => {
    await openConversation(page)
    await removeIfAdded(page)
    await expect(places(page).getByText('Places:')).toBeVisible()
    const own = places(page).getByTestId('place-own')
    await expect(own).toHaveText('Your space')
    await expect(own.getByRole('button')).toHaveCount(0)
  })

  test('Add place… lists the places the person can open, tells them what it lets the agent do, and adds only on Add @SC-1441', async ({ page }) => {
    await openConversation(page)
    await places(page).getByRole('button', { name: 'Add place…' }).click()
    const panel = page.getByTestId('add-place-panel')
    await expect(panel).toContainText('Only places you can access are listed.')
    await panel.getByRole('button', { name: new RegExp(PLACE!) }).click()
    await expect(page.getByTestId('add-place-notice')).toContainText(new RegExp(`will be able to read ${PLACE}'s knowledge and start work there`))
    // Not yet: a Cancel leaves the conversation as it was.
    await panel.getByRole('button', { name: 'Cancel' }).click()
    await expect(added(page)).toHaveCount(0)

    await places(page).getByRole('button', { name: 'Add place…' }).click()
    await page.getByTestId('add-place-panel').getByRole('button', { name: new RegExp(PLACE!) }).click()
    await page.getByTestId('add-place-panel').getByRole('button', { name: `Add ${PLACE}`, exact: true }).click()
    await expect(added(page)).toBeVisible()
    // It stays after a reload: the place is the conversation's, not the screen's.
    await page.reload()
    await expect(added(page)).toBeVisible({ timeout: 20_000 })
  })

  test('a cross removes the place @SC-1441', async ({ page }) => {
    await openConversation(page)
    await expect(added(page)).toBeVisible()
    await added(page).getByRole('button', { name: `Remove ${PLACE}` }).click()
    await expect(added(page)).toHaveCount(0)
    await page.reload()
    await expect(places(page)).toBeVisible()
    await expect(added(page)).toHaveCount(0)
  })

  test('the lead\'s card asks to add a place; Not now hides it, and Add adds it @SC-1440', async ({ page }) => {
    await openConversation(page)
    await expect(card(page)).toContainText(`Add a place to this conversation: ${PLACE}`)
    await expect(card(page).getByRole('button', { name: 'Not now' })).toBeVisible()

    // Not now hides the card on this screen only; it is back after a reload while the place is not added.
    await card(page).getByRole('button', { name: 'Not now' }).click()
    await expect(card(page)).toHaveCount(0)
    await page.reload()
    await expect(card(page)).toBeVisible({ timeout: 20_000 })

    await card(page).getByRole('button', { name: `Add ${PLACE}`, exact: true }).click()
    await expect(added(page)).toBeVisible()
    await expect(card(page).getByTestId('suggest-place-added')).toHaveText('Added to this conversation')
    await expect(card(page).getByRole('button')).toHaveCount(0)
  })

  test('a phone shows the count, and a tap opens the places as a sheet @SC-1441', async ({ page }) => {
    await openConversation(page)
    await expect(added(page)).toBeVisible()
    await page.setViewportSize({ width: 375, height: 812 })
    const count = places(page).getByRole('button', { name: /^2 places$/ })
    await expect(count).toBeVisible()
    await count.click()
    const sheet = page.getByTestId('places-sheet')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Your space')
    await expect(sheet).toContainText(PLACE!)
    await sheet.getByRole('button', { name: `Remove ${PLACE}` }).click()
    await expect(sheet.getByTestId('place-added')).toHaveCount(0)
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(places(page).getByRole('button', { name: /^1 place$/ })).toBeVisible()
  })
})
