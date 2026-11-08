import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { at } from './fixtures/address'
import { memberProjectKey } from './fixtures/memberProject'

// A place's navigation: the rail stays, and the place's menu opens beside it (on a phone, a drawer from the right).
// Your space is the place used where any place will do, since every person has one.

const rail = (page: Page) => page.getByRole('navigation', { name: 'Main' })
const spaceMenu = (page: Page) => page.getByRole('navigation', { name: 'Your space menu' })
const sections = (page: Page) => page.getByRole('list', { name: 'Your space sections' })

test.describe('a place’s menu on a wide window', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN)
  })

  test('opens beside the rail, which keeps the app’s places; the breadcrumb starts at Home @SC-1021 @SC-1044', async ({ page }) => {
    await page.goto('/space')
    await expect(rail(page).getByRole('link', { name: 'Home' })).toBeVisible()
    await expect(page.getByTestId('place-menu-header')).toContainText('Your space')
    await expect(sections(page).getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    await sections(page).getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(at('/space?tool=tasks'))
    await expect(sections(page).getByRole('link', { name: /^Tasks/ })).toHaveAttribute('aria-current', 'page')
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(crumbs.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    await expect(crumbs.getByRole('button')).toHaveCount(1)
  })

  test('hides from its header, leaves the show icon at the breadcrumb’s start, and stays hidden after a reload', async ({ page }) => {
    await page.goto('/space?tool=tasks')
    await spaceMenu(page).getByRole('button', { name: "Hide Your space's menu" }).click()
    await expect(spaceMenu(page)).toHaveCount(0)
    await expect(page).toHaveURL(at('/space?tool=tasks'))
    const show = page.getByTestId('screen-bar').getByRole('button', { name: "Show Your space's menu" })
    await expect(show).toBeVisible()
    await page.reload()
    await expect(spaceMenu(page)).toHaveCount(0)
    await show.click()
    await expect(spaceMenu(page)).toBeVisible()
  })

  test('Find a project from the breadcrumb lands on the same section of the project chosen; Esc closes it @SC-1044', async ({ page }) => {
    const key = await memberProjectKey(page)
    await page.goto('/space?tool=tasks')
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await crumbs.getByRole('button', { name: /find a project/ }).click()
    const finder = page.getByRole('dialog', { name: 'Find a project' })
    await expect(finder.getByRole('link', { name: 'All projects →' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(finder).toHaveCount(0)
    await expect(page).toHaveURL(at('/space?tool=tasks'))
    await crumbs.getByRole('button', { name: /find a project/ }).click()
    await finder.locator(`a[href="/projects/${key}?tool=tasks"]`).click()
    await expect(page).toHaveURL(at(`/projects/${key}?tool=tasks`))
    await expect(page.getByTestId('place-menu')).toBeVisible()
  })

  test('leaving the place from the rail closes its menu @SC-1021', async ({ page }) => {
    await page.goto('/space?tool=tasks')
    await rail(page).getByRole('link', { name: /^Your tasks/ }).click()
    await expect(page).toHaveURL(at('/tasks'))
    await expect(page.getByTestId('place-menu')).toHaveCount(0)
  })
})

test.describe('a place’s menu on a medium window (1024–1279)', () => {
  test.use({ viewport: { width: 1100, height: 800 } })

  test('the menu is icons: one per section, its name on hover; the rail stays slim @SC-1022', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/space?tool=boards')
    const boards = sections(page).getByRole('link', { name: /^Boards/ })
    await expect(boards).toHaveAttribute('aria-current', 'page')
    await expect(boards).toHaveAttribute('title', /^Boards/)
    expect((await rail(page).boundingBox())!.width).toBeLessThan(100)
    expect((await spaceMenu(page).boundingBox())!.width).toBeLessThan(100)
  })
})

test.describe('a place on a phone', () => {
  test.use({ viewport: { width: 375, height: 800 } })

  test('☰ is the main drawer, the same everywhere, never a place’s menu @SC-1022', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/space?tool=boards')
    const header = page.getByTestId('mobile-header')
    await header.getByRole('button', { name: 'Open menu' }).click()
    await expect(rail(page).getByRole('link', { name: 'Home' })).toBeInViewport()
    await expect(sections(page)).toHaveCount(0)
  })

  test('inside a project: ☰ on a section, the section over the project’s name, and the project drawer from the ⋯ with Find a project @SC-1022 @SC-1043', async ({ page }) => {
    await signIn(page, ADMIN)
    const key = await memberProjectKey(page)
    await page.goto(`/projects/${key}?tool=boards`)
    const header = page.getByTestId('mobile-header')
    // A project's section is a place of its own on the phone: ☰ opens the main drawer; ‹ Back is for sub-pages.
    await expect(header.getByRole('button', { name: /^Open menu/ })).toBeVisible()
    await expect(header.getByRole('link', { name: 'Back' })).toHaveCount(0)
    await expect(header).toContainText('Boards')
    await header.getByRole('button', { name: 'Actions for this screen' }).click()
    await page.getByRole('menuitem', { name: / menu ›$/ }).click()
    const drawer = page.getByRole('dialog', { name: / menu$/ })
    await expect(drawer.getByRole('link', { name: /^Boards/ })).toHaveAttribute('aria-current', 'page')
    await drawer.getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(at(`/projects/${key}?tool=tasks`))
    await expect(drawer).toHaveCount(0)
    await header.getByRole('button', { name: 'Actions for this screen' }).click()
    await page.getByRole('menuitem', { name: / menu ›$/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: /find a project/ }).click()
    const finder = page.getByRole('dialog', { name: 'Find a project' })
    await expect(finder.getByRole('link', { name: 'All projects →' })).toBeVisible()
    await page.getByTestId('project-drawer-backdrop').click({ position: { x: 20, y: 400 } })
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(at(`/projects/${key}?tool=tasks`))
  })
})
