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

  test('a project opens on Overview with ‹ Back; its drawer comes from the right, and choosing a section closes it @SC-1022', async ({ page }) => {
    await page.goto('/projects')
    const first = page.locator('a[href^="/projects/"]').first()
    test.skip((await first.count()) === 0, 'needs at least one project in the database')
    await first.click()
    await expect(page.getByTestId('project-overview')).toBeVisible()
    const header = page.getByTestId('mobile-header')
    await expect(header.getByRole('link', { name: 'Back' })).toBeVisible()
    await expect(header).toContainText('Overview')
    const fits = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1)
    expect(fits).toBe(true)
    await header.getByRole('button', { name: / menu$/ }).click()
    const drawer = page.getByRole('dialog', { name: / menu$/ })
    const box = await drawer.boundingBox()
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeGreaterThanOrEqual(374)
    const sections = drawer.getByRole('list', { name: /sections$/ })
    await expect(sections.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    await sections.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/tool=settings/)
    await expect(drawer).toHaveCount(0)
    await expect(header).toContainText('Settings')
    // Back leaves the project for the list it sits in, where ☰ is back.
    await header.getByRole('link', { name: 'Back' }).click()
    await expect(page).toHaveURL(at('/projects'))
    await expect(header.getByRole('button', { name: 'Open menu' })).toBeVisible()
  })
})

test.describe('desktop 1280px — the shell layout @SC-224 @SC-225', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the rail is inline, with notifications and Runs at its foot; no top bar or hamburger', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav).toBeVisible()
    await expect(nav).toHaveCSS('position', 'static')
    const library = await nav.getByRole('link', { name: 'Library' }).boundingBox()
    for (const name of [/^Notifications/, /^Runs/]) {
      const b = await nav.getByTestId('sidebar-foot').getByRole('button', { name }).boundingBox()
      expect(b?.y ?? 0).toBeGreaterThan(library?.y ?? 0)
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

// One model at every width (the desktop shell's §12): beside the work when wide, sliding over it when medium, full screen
// when narrow and opened from the top bar's chat icon. These need the seeded conversation (fixtures/seed-e2e-data.mjs).
const dockOf = (page: Page) => page.getByRole('complementary', { name: 'Conversation' })
const seeded = () => process.env.E2E_CONVERSATION_ID

test.describe('phone 375px — the conversation full screen, opened from the top bar', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('a conversation’s address opens it full screen; ⌄ folds it away, and the chat’s icon in the top bar opens it again on every screen @SC-1039', async ({ page }) => {
    const id = seeded()
    test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
    await signIn(page, MEMBER)
    await page.goto('/')
    await expect(page.getByTestId('dock-bar')).toHaveCount(0)
    await page.goto(`/chat/t/${id}`)
    await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`))
    const dock = dockOf(page)
    await expect(dock).toHaveAttribute('data-width', 'narrow')
    const box = await dock.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(374)
    await expect(dock.getByTestId('dock-header').getByRole('button', { name: /^Chat menu/ })).toBeVisible()
    await dock.getByRole('button', { name: 'Fold the chat away' }).click()
    await expect(page.getByRole('complementary', { name: 'Conversation', includeHidden: true })).toHaveClass(/(^|\s)hidden(\s|$)/)
    const chatIcon = page.getByTestId('mobile-header').getByTestId('dock-phone-button')
    await expect(chatIcon).toBeVisible()
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(new RegExp(`/tasks\\?c=${id}$`))
    await expect(chatIcon).toBeVisible()
    const fits = await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth + 1)
    expect(fits).toBe(true)
    await chatIcon.click()
    await expect(dock).toHaveAttribute('data-position', 'docked')
    await expect(dock.getByTestId('conversation-header')).toBeVisible()
  })

  test('⋮ → New conversation shows a sheet over the open conversation, and Close puts the conversation back @SC-1039', async ({ page }) => {
    const id = seeded()
    test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
    await signIn(page, MEMBER)
    await page.goto(`/chat/t/${id}`)
    const dock = dockOf(page)
    await dock.getByRole('button', { name: /^Chat menu/ }).click()
    await page.getByRole('dialog', { name: 'Chat' }).getByRole('button', { name: 'New conversation' }).click()
    const sheet = page.getByRole('dialog', { name: 'New conversation' })
    await expect(sheet).toBeVisible()
    expect((await sheet.boundingBox())?.width).toBeGreaterThanOrEqual(374)
    await expect(sheet.getByRole('option', { selected: true })).toContainText('Your space')
    await sheet.getByRole('button', { name: 'Close' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`))
    await expect(dock.getByTestId('conversation-header')).toBeVisible()
    await expect(dock).toHaveAttribute('data-position', 'docked')
  })
})

test.describe('medium 1024px — the navigation as icons, the conversation sliding over', () => {
  test.use({ viewport: { width: 1024, height: 800 } })

  test('the panel slides over the page, Minimised and ⌘J leave only its bar and bring it back, and going somewhere minimises it @SC-1038 @SC-1033', async ({ page }) => {
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
    await dock.getByTestId('dock-state').getByRole('radio', { name: 'Minimised (⌘J)' }).click()
    await expect(dock).toHaveAttribute('data-position', 'collapsed')
    await expect(dock.getByTestId('dock-bar')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+j')
    await expect(dock).toHaveAttribute('data-position', 'docked')
    await nav.getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(new RegExp(`/tasks\\?c=${id}$`))
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
