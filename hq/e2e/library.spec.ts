import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { at } from './fixtures/address'

// The Library in the navigation (skills spec part 6): its place among the places, the one searched view with its
// Type and Show filters, and the Marketplace button behind its flag. Written against the seeded e2e organisation;
// run by the lead against a running hq.

test.use({ viewport: { width: 1280, height: 800 } })

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })

test.beforeEach(async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/')
  await expect(nav(page)).toBeVisible()
})

test.describe('the Library in the navigation', () => {
  test('comes after Agents, and Tasks comes before Agents', async ({ page }) => {
    const labels = await nav(page).getByRole('link').allTextContents()
    const at = (name: string) => labels.findIndex(t => t.startsWith(name))
    for (const place of ['Home', 'Chat', 'Your space', 'Projects', 'Tasks', 'Agents', 'Library']) expect(at(place), place).toBeGreaterThanOrEqual(0)
    expect(at('Home')).toBeLessThan(at('Chat'))
    expect(at('Chat')).toBeLessThan(at('Your space'))
    expect(at('Your space')).toBeLessThan(at('Projects'))
    expect(at('Projects')).toBeLessThan(at('Tasks'))
    expect(at('Tasks')).toBeLessThan(at('Agents'))
    expect(at('Agents')).toBeLessThan(at('Library'))
  })

  test('opens the Library, marked where you are', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Library' }).click()
    await expect(page).toHaveURL(at('/library'))
    await expect(nav(page).getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible()
  })

  test('the old Skills address opens the Library narrowed to skills', async ({ page }) => {
    await page.goto('/skills')
    await expect(page).toHaveURL(at('/library?type=skill'))
    await expect(page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^Skills/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

test.describe('the Library view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/library')
    await expect(page.getByTestId('library-rows')).toBeVisible()
  })

  test('lists what is installed in one view, with a chip for each type and each state', async ({ page }) => {
    await expect(page.getByTestId('library-row').first()).toBeVisible()
    const type = page.getByRole('group', { name: 'Type' })
    for (const t of ['All', 'Skills', 'Agents', 'Boards', 'Teams']) await expect(type.getByRole('button', { name: new RegExp(`^${t}`) })).toBeVisible()
    const show = page.getByRole('group', { name: 'Show' })
    for (const s of ['Waiting for review', 'Update available', 'Draft', 'No agent yet', 'Set aside', 'Unsigned']) {
      await expect(show.getByRole('button', { name: new RegExp(`^${s}`) })).toBeVisible()
    }
  })

  test('a Type chip narrows the list to that type and keeps it in the address', async ({ page }) => {
    await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^Boards/ }).click()
    await expect(page).toHaveURL(/type=board/)
    const rows = page.getByTestId('library-row')
    await expect(rows.first()).toContainText('board ·')
    await expect(rows.filter({ hasNotText: 'board ·' })).toHaveCount(0)
    await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^All/ }).click()
    await expect(page).not.toHaveURL(/type=/)
  })

  test('a Show chip narrows by state and a second click clears it', async ({ page }) => {
    const chip = page.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^Unsigned/ })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/show=unsigned/)
    await expect(page.getByTestId('library-row').filter({ hasNotText: 'Unsigned' })).toHaveCount(0)
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  test('the search finds an asset of any type and says when nothing matches', async ({ page }) => {
    const search = page.getByRole('searchbox')
    await search.fill('zzz-nothing-is-called-this')
    await expect(page.getByText('Nothing matches.')).toBeVisible()
    await expect(page.getByTestId('library-row')).toHaveCount(0)
    await search.fill('')
    await expect(page.getByTestId('library-row').first()).toBeVisible()
  })

  test('the administrator sees Add, New skill and Settings; the Marketplace button is a development button', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'New skill' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Add$/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
    // The e2e server runs in development, where the flag is on (adr-0116).
    await page.getByRole('link', { name: 'Marketplace' }).click()
    await expect(page).toHaveURL(at('/library/marketplace'))
    await expect(page.getByTestId('marketplace-page')).toContainText('The Marketplace is not available yet')
  })
})
