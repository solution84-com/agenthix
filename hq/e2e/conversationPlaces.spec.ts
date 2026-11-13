import { test, expect, type Page } from '@playwright/test'
import { signIn, MEMBER } from './fixtures/auth'
import { skipUnlessSeeded } from './fixtures/seeded'

/**
 * Places in a conversation (agent knowledge spec, part 4 and screens C3; walkthrough D5 and D6): the header lists the
 * places a conversation reaches, a person adds one (once told what that lets the agent do) or removes it with its
 * cross, the lead's card asking for a place is answered with a click, and the places are stacked tiles on the header's line, ▾ opens them by name, and a phone opens the same list as a sheet.
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
const tiles = (page: Page) => places(page).getByTestId('place-tile')
const added = (page: Page) => page.getByTestId('places-popover').getByTestId('place-added').filter({ hasText: PLACE! })
const openPlaces = async (page: Page) => {
  if ((await page.getByTestId('places-popover').count()) === 0) await places(page).getByTestId('places-tiles').click()
}
const card = (page: Page) => page.getByTestId('suggest-place-card')

async function openConversation(page: Page): Promise<void> {
  await signIn(page, MEMBER)
  await page.goto(`/chat/t/${CONVERSATION}`)
  await expect(places(page)).toBeVisible({ timeout: 20_000 })
}

async function removeIfAdded(page: Page): Promise<void> {
  await openPlaces(page)
  if ((await added(page).count()) > 0) {
    await added(page).getByRole('button', { name: `Remove ${PLACE}` }).click()
    await expect(added(page)).toHaveCount(0)
  }
}

test.describe('places in a conversation', () => {
  skipUnlessSeeded(test, { E2E_PLACES_CONVERSATION_ID: CONVERSATION, E2E_PLACES_PROJECT_NAME: PLACE }, 'needs the operator\'s conversation: run seed-e2e-knowledge.mjs and set E2E_PLACES_CONVERSATION_ID and E2E_PLACES_PROJECT_NAME')
  test.describe.configure({ mode: 'serial' })

  test('the header lists the conversation\'s own place first, with no cross to remove it @SC-1441', async ({ page }) => {
    await openConversation(page)
    await removeIfAdded(page)
    await expect(tiles(page).first()).toHaveAttribute('title', 'Your space')
    await openPlaces(page)
    const own = page.getByTestId('places-popover').getByTestId('place-own')
    await expect(own).toHaveText('Your space')
    await expect(own.getByRole('button')).toHaveCount(0)
  })

  test('Add a place lists the places the person can open, tells them what it lets the agent do, and adds only on Add @SC-1441', async ({ page }) => {
    await openConversation(page)
    await openPlaces(page)
    await page.getByTestId('places-popover').getByRole('button', { name: 'Add a place' }).click()
    const panel = page.getByTestId('add-place-panel')
    await expect(panel).toContainText('Only places you can access are listed.')
    await panel.getByRole('button', { name: new RegExp(PLACE!) }).click()
    await expect(page.getByTestId('add-place-notice')).toContainText(new RegExp(`will be able to read ${PLACE}'s knowledge and start work there`))
    // Not yet: a Cancel leaves the conversation as it was.
    await panel.getByRole('button', { name: 'Cancel' }).click()
    await expect(added(page)).toHaveCount(0)

    await openPlaces(page)
    await page.getByTestId('places-popover').getByRole('button', { name: 'Add a place' }).click()
    await page.getByTestId('add-place-panel').getByRole('button', { name: new RegExp(PLACE!) }).click()
    await page.getByTestId('add-place-panel').getByRole('button', { name: `Add ${PLACE}`, exact: true }).click()
    await expect(added(page)).toBeVisible()
    // It stays after a reload: the place is the conversation's, not the screen's.
    await page.reload()
    await expect(tiles(page)).toHaveCount(2, { timeout: 20_000 })
    await openPlaces(page)
    await expect(added(page)).toBeVisible()
  })

  test('a cross removes the place @SC-1441', async ({ page }) => {
    await openConversation(page)
    await openPlaces(page)
    await expect(added(page)).toBeVisible()
    await added(page).getByRole('button', { name: `Remove ${PLACE}` }).click()
    await expect(added(page)).toHaveCount(0)
    await page.reload()
    await expect(places(page)).toBeVisible()
    await expect(tiles(page)).toHaveCount(1)
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
    await expect(tiles(page)).toHaveCount(2)
    await expect(card(page).getByTestId('suggest-place-added')).toHaveText('Added to this conversation')
    await expect(card(page).getByRole('button')).toHaveCount(0)
  })

  test('a phone opens the places as a sheet from the same tiles @SC-1441', async ({ page }) => {
    await openConversation(page)
    await expect(tiles(page)).toHaveCount(2)
    await page.setViewportSize({ width: 375, height: 812 })
    await openPlaces(page)
    const sheet = page.getByTestId('places-popover')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Your space')
    await expect(sheet).toContainText(PLACE!)
    await sheet.getByRole('button', { name: `Remove ${PLACE}` }).click()
    await expect(sheet.getByTestId('place-added')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(tiles(page)).toHaveCount(1)
  })
})
