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

test.describe('the rail @SC-011', () => {
  test('lists the places, then Manage, notifications and you; your initials open your menu @SC-1045', async ({ page }) => {
    const n = nav(page)
    await expect(n.getByRole('button', { name: /^Notifications/ })).toBeVisible()
    await expect(n.getByRole('button', { name: /^Runs/ })).toBeVisible()
    for (const place of ['Home', 'Chat', 'Your space', 'Projects', 'Boards', 'Your tasks', 'Workspaces', 'Routines', 'Workrooms', 'Agents', 'Library']) {
      await expect(n.getByRole('link', { name: new RegExp(`^${place}`) })).toBeVisible()
    }
    // Pinned projects lead the Projects list, not the rail; the rail does not collapse.
    await expect(n.getByRole('region', { name: 'Pinned' })).toHaveCount(0)
    await expect(n.getByRole('button', { name: /navigation$/ })).toHaveCount(0)
    expect((await n.boundingBox())!.width).toBe(56)
    const foot = n.getByTestId('sidebar-foot')
    await expect(foot.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/admin')
    await expect(n.getByRole('link', { name: 'Organisation' })).toHaveCount(0)
    await foot.getByRole('button', { name: /, account menu$/ }).click()
    const menu = page.getByRole('menu', { name: 'Account' })
    await expect(menu.getByRole('menuitem', { name: 'Your settings' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Organisation' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /^Help and the guide/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(foot.getByRole('button', { name: /, account menu$/ })).toBeFocused()
    // Retired from the navigation (their pages stay for links).
    for (const gone of ['Dashboard', 'My tasks', 'Products', 'Programs']) {
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
  test('Projects is current on the list; Your tasks on /tasks', async ({ page }) => {
    await page.goto('/projects')
    await expect(nav(page).getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page')
    await expect(nav(page).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current', 'page')
    await page.goto('/tasks')
    await expect(nav(page).getByRole('link', { name: /^Your tasks/ })).toHaveAttribute('aria-current', 'page')
    await expect(nav(page).getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current', 'page')
  })
})

test.describe('the screen bar and its breadcrumb @SC-152', () => {
  test('crumbs with a link navigate without a reload; the last crumb is the current page', async ({ page }) => {
    await page.goto('/tasks?view=done')
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(crumbs.getByRole('link', { name: 'Home' })).toBeVisible()
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
    await expect(page.getByText('The projects you are in, and the open ones you can join')).toBeVisible()
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
        // Runs names what is running even with nothing waiting; neither says anything needs the person.
        expect((await button.getAttribute('aria-label')) ?? '').not.toMatch(/need you/)
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

test.describe('a place’s sections are its menu beside the rail', () => {
  test('your space opens on Overview from its entry; a section opens from the panel; Talk starts a conversation in the dock @SC-1021 @SC-1024 @SC-1023', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Your space' }).click()
    await expect(page).toHaveURL(at('/space'))
    const sections = page.getByRole('navigation', { name: 'Your space menu' }).getByRole('list', { name: 'Your space sections' })
    await expect(sections.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('place-overview')).toBeVisible()
    await sections.getByRole('link', { name: /^Tasks/ }).click()
    await expect(page).toHaveURL(at('/space?tool=tasks'))
    await expect(sections.getByRole('link', { name: /^Tasks/ })).toHaveAttribute('aria-current', 'page')
    const dock = page.getByRole('complementary', { name: 'Conversation' })
    // A person with no conversation yet has the dock fill itself with a new one: a new conversation then fills the
    // panel, with Cancel. Over an open conversation it is a dialog, with ✕.
    const filledWithDraft = (await dock.getByTestId('dock-draft').count()) > 0
    // Tasks has its own Talk, in its heading beside New task.
    await page.getByTestId('shell-screen').getByRole('button', { name: 'Talk about tasks' }).click()
    const draft = filledWithDraft ? dock.getByTestId('dock-draft') : page.getByRole('dialog', { name: 'New conversation' })
    await expect(draft).toBeVisible()
    await expect(draft.getByRole('option', { selected: true })).toContainText('Your space')
    await expect(draft.getByRole('textbox', { name: 'Ask any agent…' })).toBeFocused()
    await expect(page).toHaveURL(at('/space?tool=tasks'))
    await expect(sections.getByRole('link', { name: /^Tasks/ })).toHaveAttribute('aria-current', 'page')
    if (filledWithDraft) {
      // Cancel goes back to the conversation the dock filled itself with: it is never empty.
      await dock.getByRole('button', { name: 'Cancel' }).click()
      await expect(dock.getByTestId('dock-draft')).toHaveCount(1)
    } else {
      await draft.getByRole('button', { name: 'Close' }).click()
      await expect(draft).toHaveCount(0)
    }
    await expect(dock).toBeVisible()
  })

  test('the Chat page is the list of every conversation, and a former tool address opens that section of your space @SC-507', async ({ page }) => {
    await page.goto('/chat')
    await expect(page.getByTestId('chat-list-header').getByRole('heading', { name: 'Chat' })).toBeVisible()
    await expect(page.getByTestId('place-menu')).toHaveCount(0)
    await expect(nav(page).getByRole('link', { name: 'Home' })).toBeVisible()
    await page.goto('/chat?tool=automation')
    await expect(page).toHaveURL(at('/space?tool=automation'))
    await expect(page.getByRole('navigation', { name: 'Your space menu' }).getByRole('list', { name: 'Your space sections' }).getByRole('link', { name: /^Automation/ })).toHaveAttribute('aria-current', 'page')
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
    await expect(dock.getByTestId('conversation-header')).toBeVisible()
    await nav(page).getByRole('link', { name: /^Your tasks/ }).click()
    await expect(page).toHaveURL(new RegExp(`/tasks\\?c=${id}$`))
    await expect(dock).toBeVisible()
    await page.reload()
    await expect(dock.getByTestId('conversation-header')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`))
    await expect(dock).toBeVisible()
  })
})

test.describe('the dock’s buttons', () => {
  const dockOf = (page: Page) => page.getByRole('complementary', { name: 'Conversation' })

  test('Conversations lists them over the page; ＋ opens a new conversation over the open one, and ✕, Esc or the scrim put it back @SC-1035 @SC-1031', async ({ page }) => {
    const id = process.env.E2E_CONVERSATION_ID
    test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
    await signIn(page, MEMBER)
    await page.goto(`/space?tool=tasks&c=${id}`)
    const dock = dockOf(page)
    await dock.getByTestId('dock-bar').getByRole('button', { name: /^Conversations/ }).click()
    const list = page.getByRole('dialog', { name: 'Conversations' })
    await expect(list.getByTestId('inbox-row').first()).toBeVisible()
    await expect(list.getByRole('link', { name: 'Open in Chat' })).toBeVisible()
    await list.getByRole('link', { name: 'All in Chat →' }).click()
    await expect(list).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`))
    await dock.getByRole('button', { name: 'New conversation' }).click()
    const draft = page.getByRole('dialog', { name: 'New conversation' })
    await expect(draft).toBeVisible()
    await expect(draft.getByRole('option', { selected: true })).toContainText('Your space')
    await expect(draft.getByTestId('dock-draft-lead')).toContainText('It can use your own files.')
    await expect(page).toHaveURL(/\/chat$/)
    const box = draft.getByRole('textbox', { name: 'Ask any agent…' })
    await expect(box).toBeFocused()
    await box.fill('never sent')
    await draft.getByRole('combobox', { name: 'Find a place' }).fill('no such place anywhere')
    await expect(draft.getByText("No place called 'no such place anywhere'.", { exact: false })).toBeVisible()
    await expect(draft.getByRole('option', { selected: true })).toContainText('Your space')
    await draft.getByRole('button', { name: 'Close' }).click()
    await expect(draft).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/chat\\?c=${id}$`))
    await expect(dock.getByTestId('conversation-header')).toBeVisible()
    await dock.getByRole('button', { name: 'New conversation' }).click()
    await expect(draft.getByRole('textbox', { name: 'Ask any agent…' })).toHaveValue('')
    await expect(draft.getByRole('textbox', { name: 'Ask any agent…' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(draft).toHaveCount(0)
    await expect(dock.getByTestId('conversation-header')).toBeVisible()
    await dock.getByRole('button', { name: 'New conversation' }).click()
    await expect(draft).toBeVisible()
    await page.getByTestId('dock-scrim').click({ position: { x: 5, y: 5 } })
    await expect(draft).toHaveCount(0)
    await expect(dock.getByTestId('conversation-header')).toBeVisible()
    await dock.getByRole('button', { name: 'New conversation' }).click()
    await expect(page).toHaveURL(/\/chat$/)
    await page.goBack()
    await expect(dock.getByTestId('conversation-header')).toBeVisible()
  })

  test('the bar’s states: over the page (from the conversation’s menu) until you go somewhere, minimised to the bar by its button or ⌘J, and opened again where it was left @SC-1032 @SC-1033', async ({ page }) => {
    const id = process.env.E2E_CONVERSATION_ID
    test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
    await signIn(page, MEMBER)
    await page.goto(`/space?c=${id}`)
    const dock = dockOf(page)
    const state = dock.getByTestId('dock-state')
    await dock.getByRole('button', { name: 'Conversation menu' }).click()
    await dock.getByRole('menuitem', { name: 'Over the page' }).click()
    await expect(dock).toHaveAttribute('data-position', 'expanded')
    await expect(page.getByTestId('place-canvas')).toBeHidden()
    await nav(page).getByRole('link', { name: /^Your tasks/ }).click()
    await expect(page).toHaveURL(new RegExp(`/tasks\\?c=${id}$`))
    await expect(dock).toHaveAttribute('data-position', 'docked')
    await expect(state).toHaveAccessibleName('Minimise the chat (⌘J)')
    await state.click()
    await expect(dock).toHaveAttribute('data-position', 'collapsed')
    await expect(state).toHaveAccessibleName('Open the chat (⌘J)')
    await expect(dock.getByRole('navigation', { name: 'Chat' })).toBeVisible()
    await expect(dock.getByTestId('conversation-header')).toBeHidden()
    await page.keyboard.press('ControlOrMeta+j')
    await expect(dock).toHaveAttribute('data-position', 'docked')
    await page.keyboard.press('ControlOrMeta+j')
    await expect(dock).toHaveAttribute('data-position', 'collapsed')
    await state.click()
    await expect(dock).toHaveAttribute('data-position', 'docked')
    await dock.getByRole('button', { name: 'Conversation menu' }).click()
    await dock.getByRole('menuitem', { name: 'Over the page' }).click()
    await expect(dock).toHaveAttribute('data-position', 'expanded')
    await dock.getByRole('button', { name: 'Conversation menu' }).click()
    await dock.getByRole('menuitem', { name: 'Back beside the page' }).click()
    await expect(dock).toHaveAttribute('data-position', 'docked')
    await expect(dock.getByTestId('conversation-header')).toBeVisible()
  })
})
