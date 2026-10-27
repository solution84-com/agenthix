import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'
import { at } from './fixtures/address'

// Mobile, medium and desktop shell layout, and the open conversation at every width. SC-219's canary needs no sign-in; the rest sign in as the seeded
// e2e admin (see e2e/README.md).

test.describe('mobile 375px — no horizontal overflow @SC-219', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('unauthenticated app root at 375px has no horizontal scroll', async ({ page }) => {
    await page.goto('/')
    // The auth guard redirects visitors to /login (or /invite on first-admin bootstrap);
    // either is fine, only the layout matters.
    await page.waitForURL(/\/(login|invite)/)
    const overflow = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1)
    expect(overflow).toBe(true)
  })

  test('the signed-in shell at 375px has no horizontal scroll', async ({ page }) => {
    await signIn(page, ADMIN)
    for (const path of ['/', '/projects', '/tasks']) {
      await page.goto(path)
      await expect(page.getByTestId('mobile-header')).toBeVisible()
      const fits = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1)
      expect(fits, `${path} overflows`).toBe(true)
    }
  })
})

test.describe('mobile 375px — the phone shell @SC-221 @SC-223', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/')
  })

  test('☰ opens the full navigation as a drawer, and choosing a place closes it', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(page.getByTestId('screen-bar')).toBeHidden()
    await page.getByRole('button', { name: 'Open menu' }).click()
    await expect(nav).toBeVisible()
    await nav.getByRole('link', { name: 'Projects' }).click()
    await expect(page).toHaveURL(at('/projects'))
    await expect(page.getByTestId('nav-drawer-backdrop')).toHaveCount(0)
  })

  test('Notifications and Runs are in the header and open full-screen, closed from their own header', async ({ page }) => {
    const header = page.getByTestId('mobile-header')
    for (const name of ['Notifications', 'Runs']) {
      await header.getByRole('button', { name: new RegExp(`^${name}`) }).click()
      const panel = page.getByTestId('shell-panel')
      await expect(panel).toHaveAttribute('aria-label', name)
      const box = await panel.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(374)
      expect(box?.height).toBeGreaterThanOrEqual(811)
      // On a phone the panel's own header is ‹ and its name.
      await panel.getByRole('button', { name }).first().click()
      await expect(panel).toHaveCount(0)
    }
  })

  test('a project opens on Overview; the drawer is its panel, and choosing a section closes the drawer @SC-1022', async ({ page }) => {
    await page.goto('/projects')
    const first = page.locator('a[href^="/projects/"]').first()
    test.skip((await first.count()) === 0, 'needs at least one project in the database')
    await first.click()
    await expect(page.getByTestId('place-overview')).toBeVisible()
    const header = page.getByTestId('mobile-header')
    await expect(header.getByRole('button', { name: /^Overview, .* sections$/ })).toBeVisible()
    const fits = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1)
    expect(fits).toBe(true)
    await header.getByRole('button', { name: 'Open menu' }).click()
    const sections = page.getByRole('navigation', { name: 'Main' }).getByRole('list', { name: /sections$/ })
    await expect(sections.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    await sections.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/tool=settings/)
    await expect(page.getByTestId('nav-drawer-backdrop')).toHaveCount(0)
    await expect(header.getByRole('button', { name: /^Settings, .* sections$/ })).toBeVisible()
  })
})

test.describe('desktop 1280px — the shell layout @SC-224 @SC-225', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the navigation is inline with the panel buttons beside the logo; no top bar, rail or hamburger', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav).toBeVisible()
    await expect(nav).toHaveCSS('position', 'static')
    const logo = await nav.getByRole('link', { name: 'Agenthix' }).boundingBox()
    for (const name of [/^Notifications/, /^Runs/]) {
      const b = await nav.getByRole('button', { name }).boundingBox()
      expect(Math.abs((b?.y ?? 0) - (logo?.y ?? 99))).toBeLessThan(30)
      expect(b?.x ?? 0).toBeGreaterThan((logo?.x ?? 0) + (logo?.width ?? 0) - 1)
    }
    await expect(page.getByTestId('screen-bar')).toBeVisible()
    await expect(page.getByTestId('mobile-header')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden()
    // A panel opens over the content, beside the navigation, and the navigation stays.
    await nav.getByRole('button', { name: /^Runs/ }).click()
    const panel = await page.getByTestId('shell-panel').boundingBox()
    const navBox = await nav.boundingBox()
    expect(panel?.x ?? 0).toBeGreaterThanOrEqual((navBox?.x ?? 0) + (navBox?.width ?? 0) - 1)
    await expect(nav).toBeVisible()
  })
})

// One model at every width (the desktop shell's §12): beside the work when wide, sliding over it when medium, a pill
// when narrow. These need the seeded conversation (fixtures/seed-e2e-data.mjs).
const dockOf = (page: Page) => page.getByRole('complementary', { name: 'Conversation' })
const seeded = () => process.env.E2E_CONVERSATION_ID

test.describe('phone 375px — the conversation as a pill', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('a conversation’s address opens it full screen; ‹ puts it away to a pill on every screen, which opens it again @SC-1039', async ({ page }) => {
    const id = seeded()
    test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
    await signIn(page, MEMBER)
    await page.goto('/')
    await expect(page.getByTestId('dock-pill')).toHaveCount(0)
    await page.goto(`/chat/t/${id}`)
    await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`))
    const dock = dockOf(page)
    await expect(dock).toHaveAttribute('data-width', 'narrow')
    const box = await dock.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(374)
    await dock.getByRole('button', { name: 'Back to the page' }).click()
    const pill = page.getByTestId('dock-pill')
    await expect(pill).toBeVisible()
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(new RegExp(`/tasks\\?c=${id}$`))
    await expect(pill).toBeVisible()
    const fits = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1)
    expect(fits).toBe(true)
    await pill.click()
    await expect(dock).toHaveAttribute('data-position', 'docked')
    await expect(dock.getByTestId('dock-place-chip')).toBeVisible()
  })

  test('＋ shows the new conversation full screen with Cancel only, and Cancel puts the conversation back @SC-1039', async ({ page }) => {
    const id = seeded()
    test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
    await signIn(page, MEMBER)
    await page.goto(`/chat/t/${id}`)
    const dock = dockOf(page)
    await dock.getByRole('button', { name: 'New conversation' }).click()
    await expect(dock.getByTestId('dock-draft')).toBeVisible()
    expect((await dock.boundingBox())?.width).toBeGreaterThanOrEqual(374)
    await expect(dock.getByTestId('dock-header').getByRole('button')).toHaveText(['Cancel'])
    await expect(dock.getByRole('option', { selected: true })).toContainText('Your space')
    await dock.getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`))
    await expect(dock.getByTestId('dock-place-chip')).toBeVisible()
    await expect(dock).toHaveAttribute('data-position', 'docked')
  })
})

test.describe('medium 1024px — the navigation as icons, the conversation sliding over', () => {
  test.use({ viewport: { width: 1024, height: 800 } })

  test('the dock slides over the page, › and ⌘J put it away to its rail and back, and going somewhere slides it away @SC-1038 @SC-1033', async ({ page }) => {
    const id = seeded()
    test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
    await signIn(page, MEMBER)
    await page.goto(`/space?c=${id}`)
    const nav = page.getByRole('navigation', { name: 'Main' })
    expect((await nav.boundingBox())?.width ?? 999).toBeLessThan(100)
    await expect(nav.getByRole('button', { name: /^(Collapse|Expand) navigation$/ })).toHaveCount(0)
    const dock = dockOf(page)
    await expect(dock).toHaveAttribute('data-width', 'medium')
    await expect(dock).toHaveCSS('position', 'fixed')
    await dock.getByRole('button', { name: 'Collapse (⌘J)' }).click()
    await expect(dock.getByTestId('dock-rail')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+j')
    await expect(dock).toHaveAttribute('data-position', 'docked')
    await nav.getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(new RegExp(`tool=tasks&c=${id}$`))
    await expect(dock).toHaveAttribute('data-position', 'collapsed')
  })
})

test.describe('resizing the window', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('keeps the same conversation and its unsent text, wide to medium to phone and back @SC-1040', async ({ page }) => {
    const id = seeded()
    test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
    await signIn(page, MEMBER)
    await page.goto(`/space?c=${id}`)
    const dock = dockOf(page)
    const box = dock.getByRole('textbox').last()
    await box.fill('half a thought')
    for (const [width, form] of [[1000, 'medium'], [375, 'narrow'], [1440, 'wide']] as const) {
      await page.setViewportSize({ width, height: 900 })
      await expect(dock).toHaveAttribute('data-width', form)
      await expect(box).toHaveText('half a thought')
    }
  })
})
