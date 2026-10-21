import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { at } from './fixtures/address'

// A place's navigation: the left panel drilled into the place. Your space is the place used, since every person
// has one.

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })
const sections = (page: Page) => nav(page).getByRole('list', { name: 'Your space sections' })

test.describe('the place’s panel on a wide window', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN)
  })

  test('drills into your space: its sections down the panel, the breadcrumb’s parts open lists @SC-1021 @SC-1044', async ({ page }) => {
    await page.goto('/space')
    await expect(page.getByTestId('place-panel-header')).toContainText('Your space')
    await expect(sections(page).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    await expect(nav(page).getByTestId('sidebar-foot')).toBeVisible()
    await sections(page).getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(at('/space?tool=tasks'))
    await expect(sections(page).getByRole('link', { name: /^Tasks/ })).toHaveAttribute('aria-current', 'page')
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await crumbs.getByRole('button', { name: 'Tasks' }).click()
    await expect(page.getByRole('menu', { name: 'Tasks' }).getByRole('menuitem', { name: /^Boards/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await crumbs.getByRole('button', { name: 'Home' }).click()
    await expect(page.getByRole('menu', { name: 'Home' }).getByRole('menuitem', { name: 'Settings' })).toBeVisible()
  })

  test('‹ shows the main navigation over the panel; Esc, ✕ and a click outside move nothing @SC-1043', async ({ page }) => {
    await page.goto('/space?tool=tasks')
    const back = nav(page).getByRole('button', { name: 'Show the main navigation' })
    const goTo = page.getByRole('dialog', { name: 'Go to' })
    await back.click()
    await expect(goTo.getByRole('button', { name: 'Close' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(goTo).toHaveCount(0)
    await expect(back).toBeFocused()
    await back.click()
    await goTo.getByRole('button', { name: 'Close' }).click()
    await back.click()
    await page.getByTestId('main-nav-overlay-backdrop').click({ position: { x: 900, y: 400 } })
    await expect(goTo).toHaveCount(0)
    await back.click()
    await goTo.getByRole('link', { name: 'Your space' }).click()
    await expect(goTo).toHaveCount(0)
    await expect(page).toHaveURL(at('/space?tool=tasks'))
    await back.click()
    await goTo.getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(at('/tasks'))
    await expect(page.getByTestId('place-panel')).toHaveCount(0)
    await expect(nav(page).getByRole('link', { name: 'Home' })).toBeVisible()
  })
})

test.describe('the place’s panel on a medium window (1024–1279)', () => {
  test.use({ viewport: { width: 1100, height: 800 } })

  test('the panel is icons: one per section, its name on hover @SC-1022', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/space?tool=boards')
    const boards = sections(page).getByRole('link', { name: /^Boards/ })
    await expect(boards).toHaveAttribute('aria-current', 'page')
    await expect(boards).toHaveAttribute('title', /^Boards/)
    expect((await nav(page).boundingBox())!.width).toBeLessThan(100)
  })
})

test.describe('the place’s panel on a phone', () => {
  test.use({ viewport: { width: 375, height: 800 } })

  test('the header names the section and lists the sections; the drawer is the panel, ‹ swaps to the main navigation @SC-1022 @SC-1043', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/space?tool=boards')
    const header = page.getByTestId('mobile-header')
    await header.getByRole('button', { name: 'Boards, Your space sections' }).click()
    await page.getByRole('menu', { name: 'Your space sections' }).getByRole('menuitem', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(at('/space?tool=tasks'))
    await header.getByRole('button', { name: 'Open menu' }).click()
    await expect(sections(page).getByRole('link', { name: /^Tasks/ })).toHaveAttribute('aria-current', 'page')
    await nav(page).getByRole('button', { name: 'Show the main navigation' }).click()
    const goTo = page.getByRole('dialog', { name: 'Go to' })
    await expect(goTo.getByRole('link', { name: 'Home' })).toBeVisible()
    // ✕ goes back to the place’s panel.
    await goTo.getByRole('button', { name: 'Close' }).click()
    await expect(goTo).toHaveCount(0)
    await expect(sections(page).getByRole('link', { name: /^Tasks/ })).toBeVisible()
    // Tapping outside closes Go to and the drawer together.
    await nav(page).getByRole('button', { name: 'Show the main navigation' }).click()
    await page.getByTestId('main-nav-overlay-backdrop').click({ position: { x: 340, y: 400 } })
    await expect(goTo).toHaveCount(0)
    await expect(nav(page)).not.toBeInViewport()
    await expect(page).toHaveURL(at('/space?tool=tasks'))
  })
})
