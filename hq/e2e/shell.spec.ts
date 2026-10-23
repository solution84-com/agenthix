import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'
import { at } from './fixtures/address'

// The app shell on a wide screen: the navigation, the Notifications and Runs panels, the screen bar,
// light by default. Pure UI behaviour only the browser proves. Every test signs in as the seeded
// e2e admin (see e2e/README.md). The phone shell is in mobile-responsive.spec.ts.

test.use({ viewport: { width: 1280, height: 800 } })

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })

test.beforeEach(async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/')
  await expect(nav(page)).toBeVisible()
})

test.describe('after sign-in a person lands on Home @SC-010', () => {
  test('Home greets the person, and the dashboard is not at the root', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(nav(page).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText('Daily operations snapshot')).toHaveCount(0)
  })
})

test.describe('the navigation @SC-011', () => {
  test('lists the places, and at the foot your name, which opens Organisation, Settings and Sign out @SC-1045', async ({ page }) => {
    const n = nav(page)
    await expect(n.getByRole('link', { name: 'Agenthix' })).toBeVisible()
    await expect(n.getByRole('button', { name: /^Notifications/ })).toBeVisible()
    await expect(n.getByRole('button', { name: /^Runs/ })).toBeVisible()
    for (const place of ['Home', 'Chat', 'Your space', 'Projects', 'Agents', 'Tasks']) {
      await expect(n.getByRole('link', { name: new RegExp(`^${place}`) })).toBeVisible()
    }
    const foot = n.getByTestId('sidebar-foot')
    await expect(foot).toBeVisible()
    // The organisation's places and yours are behind your name, not rows of their own.
    await expect(n.getByRole('link', { name: 'Organisation' })).toHaveCount(0)
    await foot.getByRole('button', { name: /, account menu$/ }).click()
    const menu = page.getByRole('menu', { name: 'Account' })
    await expect(menu.getByRole('menuitem', { name: 'Overview' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /^Manage/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Your settings' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(foot.getByRole('button', { name: /, account menu$/ })).toBeFocused()
    // Retired from the navigation (their pages stay for links).
    for (const gone of ['Dashboard', 'My tasks', 'Boards', 'Workspaces', 'Products', 'Programs', 'Library']) {
      await expect(n.getByRole('link', { name: gone, exact: true })).toHaveCount(0)
    }
  })

  test('there is no global top bar and no global right panel', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Agent activity' })).toHaveCount(0)
    await expect(page.getByTestId('screen-bar')).toBeVisible()
    await expect(page.getByTestId('mobile-header')).toBeHidden()
  })
})

test.describe('the navigation highlights the current place @SC-150', () => {
  test('Projects is current on the list; Tasks on /tasks', async ({ page }) => {
    await page.goto('/projects')
    await expect(nav(page).getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page')
    await expect(nav(page).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current', 'page')
    await page.goto('/tasks')
    await expect(nav(page).getByRole('link', { name: /^Tasks/ })).toHaveAttribute('aria-current', 'page')
    await expect(nav(page).getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current', 'page')
  })
})

test.describe('collapsing the navigation @SC-151', () => {
  test('narrows it to a 64px strip of icons, keeps the choice across pages, and expands again', async ({ page }) => {
    const n = nav(page)
    await expect(n).toHaveCSS('width', '240px')
    await n.getByRole('button', { name: 'Collapse navigation' }).click()
    await expect(n).toHaveCSS('width', '64px')
    // Labels give way to icons, each still named; you are your avatar.
    await expect(n.getByRole('link', { name: 'Projects' })).toBeVisible()
    await expect(n.getByText('Pinned')).toHaveCount(0)
    await expect(n.getByRole('button', { name: /^Notifications/ })).toBeVisible()
    await expect(n.getByRole('button', { name: /^Runs/ })).toBeVisible()
    // The choice is remembered from page to page.
    await page.goto('/projects')
    await expect(nav(page)).toHaveCSS('width', '64px')
    await nav(page).getByRole('button', { name: 'Expand navigation' }).click()
    await expect(nav(page)).toHaveCSS('width', '240px')
  })
})

test.describe('the screen bar and its breadcrumb @SC-152', () => {
  test('crumbs with a link navigate without a reload; the last crumb is the current page', async ({ page }) => {
    await page.goto('/tasks?view=done')
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(crumbs.getByText('Done')).toHaveAttribute('aria-current', 'page')
    await page.evaluate(() => { (window as unknown as { __kept: boolean }).__kept = true })
    await crumbs.getByRole('link', { name: 'Tasks' }).click()
    await expect(page).toHaveURL(at('/tasks'))
    // The page was not reloaded: the marker set before the click is still there.
    expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true)
  })
})

test.describe('a page header shows its title and subtitle @SC-153', () => {
  test('Projects has a title, a subtitle and its action', async ({ page }) => {
    await page.goto('/projects')
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible()
    await expect(page.getByText('Your projects, and their boards, workspaces and routines')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New project', exact: true })).toBeVisible()
  })
})

test.describe('the Notifications and Runs panels @SC-014', () => {
  test('each opens beside the navigation, one at a time, and Escape closes it on the same screen', async ({ page }) => {
    await page.goto('/projects')
    const panel = page.getByTestId('shell-panel')
    await nav(page).getByRole('button', { name: /^Notifications/ }).click()
    await expect(panel).toHaveAttribute('aria-label', 'Notifications')
    await expect(page).toHaveURL(/panel=notifications/)
    // The other button switches to its panel.
    await nav(page).getByRole('button', { name: /^Runs/ }).click()
    await expect(panel).toHaveAttribute('aria-label', 'Runs')
    await expect(page).toHaveURL(/panel=runs/)
    await expect(page.getByTestId('shell-panel')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(page).toHaveURL(/\/projects(\?|$)/)
    await expect(page).not.toHaveURL(/panel=/)
  })

  test('its close button and a click outside it close it', async ({ page }) => {
    await page.goto('/projects')
    await nav(page).getByRole('button', { name: /^Notifications/ }).click()
    await page.getByRole('button', { name: 'Close the panel' }).click()
    await expect(page.getByTestId('shell-panel')).toHaveCount(0)
    await nav(page).getByRole('button', { name: /^Runs/ }).click()
    // Just beside the panel: further right, the conversation beside the page is over the dismiss layer.
    const panel = (await page.getByTestId('shell-panel').boundingBox())!
    const dismiss = page.getByTestId('shell-panel-dismiss')
    const layer = (await dismiss.boundingBox())!
    await dismiss.click({ position: { x: panel.x + panel.width + 40 - layer.x, y: 400 - layer.y } })
    await expect(page.getByTestId('shell-panel')).toHaveCount(0)
  })

  test('a deep link (?panel=runs) opens the panel on load', async ({ page }) => {
    await page.goto('/projects?panel=runs')
    await expect(page.getByTestId('shell-panel')).toHaveAttribute('aria-label', 'Runs')
  })
})

test.describe('the panel buttons count what needs the person @SC-154', () => {
  test('a count shows only when there is something to count, and the label says it', async ({ page }) => {
    for (const [name, id] of [['Notifications', 'notifications-count'], ['Runs', 'runs-count']] as const) {
      const button = nav(page).getByRole('button', { name: new RegExp(`^${name}`) })
      const badge = button.getByTestId(id)
      if (await badge.count()) {
        const label = (await button.getAttribute('aria-label')) ?? ''
        expect(label).toMatch(new RegExp(`^${name}, .*\\d`))
      } else {
        await expect(button).toHaveAttribute('aria-label', name)
      }
    }
  })
})

test.describe('an unknown run opens "Session not found" in the Runs panel @SC-156', () => {
  test('?runs=<unknown id> shows the not-found state', async ({ page }) => {
    await page.goto('/?runs=does-not-exist')
    await expect(page.getByTestId('shell-panel')).toHaveAttribute('aria-label', 'Runs')
    // The panel shows Loading… while the read retries, then the not-found state.
    await expect(page.getByText('Session not found')).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('hq is light by default @SC-489', () => {
  test('no dark theme attribute until the person chooses dark', async ({ page }) => {
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const [r, g, b] = (bg.match(/\d+/g) ?? ['0', '0', '0']).map(Number)
    expect((r + g + b) / 3).toBeGreaterThan(200)
  })
})

test.describe('a place’s sections are the left panel', () => {
  test('your space opens on Overview from its entry; a section opens from the panel; Talk starts a conversation in the dock @SC-1021 @SC-1024 @SC-1023', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Your space' }).click()
    await expect(page).toHaveURL(at('/space'))
    const sections = nav(page).getByRole('list', { name: 'Your space sections' })
    await expect(sections.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('place-overview')).toBeVisible()
    await sections.getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(at('/space?tool=tasks'))
    await expect(sections.getByRole('link', { name: /^Tasks/ })).toHaveAttribute('aria-current', 'page')
    await page.getByTestId('screen-bar').getByRole('button', { name: 'Talk in your space' }).click()
    const dock = page.getByRole('complementary', { name: 'Conversation' })
    await expect(dock.getByTestId('dock-draft')).toBeVisible()
    await expect(dock.getByRole('option', { selected: true })).toContainText('Your space')
    await expect(dock.getByRole('textbox', { name: 'Ask any agent…' })).toBeFocused()
    await expect(page).toHaveURL(at('/space?tool=tasks'))
    await expect(sections.getByRole('link', { name: /^Tasks/ })).toHaveAttribute('aria-current', 'page')
    // Cancel goes back to the conversation the dock filled itself with: it is never empty.
    await dock.getByRole('button', { name: 'Cancel' }).click()
    await expect(dock.getByTestId('dock-draft')).toHaveCount(0)
    await expect(dock).toBeVisible()
  })

  test('the Chat page is only your space’s conversation list, and a former tool address opens that section of your space @SC-507', async ({ page }) => {
    await page.goto('/chat')
    await expect(page.getByTestId('place-header').getByRole('heading', { name: 'Chat' })).toBeVisible()
    await expect(page.getByTestId('place-panel')).toHaveCount(0)
    await expect(nav(page).getByRole('link', { name: 'Home' })).toBeVisible()
    await page.goto('/chat?tool=automation')
    await expect(page).toHaveURL(at('/space?tool=automation'))
    await expect(nav(page).getByRole('list', { name: 'Your space sections' }).getByRole('link', { name: /^Automation/ })).toHaveAttribute('aria-current', 'page')
  })
})

test.describe('the docked conversation', () => {
  test('a conversation’s address opens it in the dock beside its place, and it stays across pages, reload and Back @SC-1026 @SC-1027', async ({ page }) => {
    const id = process.env.E2E_CONVERSATION_ID
    test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
    await signIn(page, MEMBER)
    await page.goto(`/chat/t/${id}`)
    await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`))
    const dock = page.getByRole('complementary', { name: 'Conversation' })
    await expect(dock.getByTestId('dock-place-chip')).toHaveText('Your space')
    await nav(page).getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(new RegExp(`/tasks\\?c=${id}$`))
    await expect(dock).toBeVisible()
    await page.reload()
    await expect(dock.getByTestId('dock-header')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`))
    await expect(dock).toBeVisible()
  })
})

test.describe('the dock’s buttons', () => {
  const dockOf = (page: Page) => page.getByRole('complementary', { name: 'Conversation' })

  test('＋ starts a draft in the place you are on, Cancel puts the conversation back, and 🕘 lists that place’s conversations @SC-1035 @SC-1031', async ({ page }) => {
    const id = process.env.E2E_CONVERSATION_ID
    test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
    await signIn(page, MEMBER)
    await page.goto(`/space?tool=tasks&c=${id}`)
    const dock = dockOf(page)
    await dock.getByRole('button', { name: 'Recent conversations' }).click()
    await expect(dock.getByTestId('dock-recent-row').first()).toBeVisible()
    await dock.getByRole('menuitem', { name: 'All conversations →' }).click()
    await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`))
    await dock.getByRole('button', { name: 'New conversation' }).click()
    await expect(dock.getByRole('heading', { name: 'New conversation' })).toBeVisible()
    await expect(dock.getByRole('option', { selected: true })).toContainText('Your space')
    await expect(dock.getByTestId('dock-draft-lead')).toContainText('It can use your own files.')
    await expect(page).toHaveURL(/\/chat$/)
    const box = dock.getByRole('textbox', { name: 'Ask any agent…' })
    await expect(box).toBeFocused()
    await box.fill('never sent')
    await dock.getByRole('combobox', { name: 'Find a place' }).fill('no such place anywhere')
    await expect(dock.getByText("No place called 'no such place anywhere'.", { exact: false })).toBeVisible()
    await expect(dock.getByRole('option', { selected: true })).toContainText('Your space')
    await dock.getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`))
    await expect(dock.getByTestId('dock-place-chip')).toHaveText('Your space')
    await dock.getByRole('button', { name: 'New conversation' }).click()
    await expect(dock.getByRole('textbox', { name: 'Ask any agent…' })).toHaveValue('')
    await expect(dock.getByRole('textbox', { name: 'Ask any agent…' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dock.getByTestId('dock-place-chip')).toHaveText('Your space')
    await dock.getByRole('button', { name: 'New conversation' }).click()
    await expect(page).toHaveURL(/\/chat$/)
    await page.goBack()
    await expect(dock.getByTestId('dock-place-chip')).toHaveText('Your space')
  })

  test('⤢ expands over the page until you go somewhere; › and ⌘J collapse it to a rail and back @SC-1032 @SC-1033', async ({ page }) => {
    const id = process.env.E2E_CONVERSATION_ID
    test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
    await signIn(page, MEMBER)
    await page.goto(`/space?c=${id}`)
    const dock = dockOf(page)
    await dock.getByRole('button', { name: 'Expand over the page' }).click()
    await expect(dock).toHaveAttribute('data-position', 'expanded')
    await expect(page.getByTestId('place-canvas')).toBeHidden()
    await nav(page).getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(new RegExp(`tool=tasks&c=${id}$`))
    await expect(dock).toHaveAttribute('data-position', 'docked')
    await dock.getByRole('button', { name: 'Collapse (⌘J)' }).click()
    await expect(dock.getByTestId('dock-rail')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+j')
    await expect(dock).toHaveAttribute('data-position', 'docked')
    await page.keyboard.press('ControlOrMeta+j')
    await expect(dock).toHaveAttribute('data-position', 'collapsed')
    await dock.getByTestId('dock-rail').click()
    await expect(dock.getByTestId('dock-place-chip')).toBeVisible()
  })
})
