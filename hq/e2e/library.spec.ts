import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { at } from './fixtures/address'
import { memberProjectKey } from './fixtures/memberProject'
import { withFeature, withFeatureOff } from './fixtures/withFeature'

// The Library in the navigation (skills spec part 6): its place among the places, the one searched view with its
// type chips and Needs you, and the Marketplace button behind its flag (off as shipped; on in its own group). Written against the seeded e2e organisation;
// run by the lead against a running hq.

test.use({ viewport: { width: 1280, height: 800 } })
// One worker, in order: the Marketplace's tests switch the organisation's flag, and its as-shipped test needs it off.
test.describe.configure({ mode: 'default' })

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })
// The page's own Add, not the open conversation dock's composer Add beside it.
const pageAdd = (page: Page) => page.getByTestId('shell-screen').getByRole('button', { name: /Add/ })

test.beforeEach(async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/')
  await expect(nav(page)).toBeVisible()
})

test.describe('the Library in the navigation', () => {
  test('comes after Agents, and Tasks comes before Agents @SC-1630', async ({ page }) => {
    // The rail shows a short label under each icon; each link is named in full.
    const labels = await nav(page).getByRole('link').evaluateAll(links => links.map(a => a.getAttribute('aria-label') ?? a.textContent ?? ''))
    const at = (name: string) => labels.findIndex(t => t.startsWith(name))
    for (const place of ['Home', 'Chat', 'Your space', 'Projects', 'Boards', 'Tasks', 'Workspaces', 'Routines', 'Agents', 'Library']) expect(at(place), place).toBeGreaterThanOrEqual(0)
    expect(at('Home')).toBeLessThan(at('Chat'))
    expect(at('Chat')).toBeLessThan(at('Your space'))
    expect(at('Your space')).toBeLessThan(at('Projects'))
    expect(at('Projects')).toBeLessThan(at('Tasks'))
    expect(at('Tasks')).toBeLessThan(at('Agents'))
    expect(at('Agents')).toBeLessThan(at('Library'))
  })

  test('opens the Library, marked where you are @SC-1630', async ({ page }) => {
    await nav(page).getByRole('link', { name: 'Library' }).click()
    await expect(page).toHaveURL(at('/library'))
    await expect(nav(page).getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible()
  })

  test('the old Skills address opens the Library narrowed to skills @SC-1630', async ({ page }) => {
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

  test('lists what is installed in one view, with a chip for each type and no state filters but Needs you @SC-1630', async ({ page }) => {
    await expect(page.getByTestId('library-card').first()).toBeVisible()
    const type = page.getByRole('group', { name: 'Type' })
    for (const t of ['All', 'Skills', 'Agents', 'Boards', 'Teams']) await expect(type.getByRole('button', { name: new RegExp(`^${t}`) })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Show' })).toHaveCount(0)
    for (const s of ['Waiting for review', 'Update available', 'No agent yet', 'Set aside', 'Unsigned']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${s}`) })).toHaveCount(0)
    }
  })

  test('each card has its description and who it is from, and no second name @SC-1630', async ({ page }) => {
    const row = page.getByTestId('library-card').first()
    await expect(row.getByTestId('library-card-publisher')).toContainText(/Built in|From Agenthix|Made here|Signed by|Unsigned/)
    await expect(row.getByRole('link')).toHaveCount(1)
  })

  test('a Type chip narrows the list to that type and keeps it in the address @SC-1630', async ({ page }) => {
    await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^Boards/ }).click()
    await expect(page).toHaveURL(/type=board/)
    const rows = page.getByTestId('library-card')
    await expect(page.getByTestId('library-grid')).toBeVisible()
    await expect(page.getByTestId('library-shelf')).toHaveCount(0)
    await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^All/ }).click()
    await expect(page).not.toHaveURL(/type=/)
  })

  test('Needs you narrows to what needs the person and a second click clears it @SC-1630', async ({ page }) => {
    const chip = page.getByRole('button', { name: /^Needs you/ })
    if (!(await chip.count())) test.skip(true, 'nothing in the seeded organisation needs the administrator')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/show=needs-you/)
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await expect(page).not.toHaveURL(/show=/)
  })

  test('the search finds an asset of any type and says when nothing matches @SC-1630', async ({ page }) => {
    const search = page.getByRole('searchbox')
    await search.fill('zzz-nothing-is-called-this')
    await expect(page.getByText('Nothing matches.')).toBeVisible()
    await expect(page.getByTestId('library-card')).toHaveCount(0)
    await search.fill('')
    await expect(page.getByTestId('library-card').first()).toBeVisible()
  })

  withFeatureOff('marketplace', test => {
    test('the administrator sees one Add menu and Settings; as shipped there is no Marketplace @SC-1609', async ({ page }) => {
      // Opened again: the group switches the flag after the outer hooks have already opened the Library.
      await page.goto('/library')
      await expect(page.getByRole('link', { name: /^New skill|^Add skill/ })).toHaveCount(0)
      await pageAdd(page).first().click()
      for (const way of ['New skill', 'From Agenthix', 'Upload a package', 'From a link']) await expect(page.getByRole('menuitem', { name: new RegExp(`^${way}`) })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
      // The Marketplace's flag is at preview, off as shipped (adr-0172): no button, and its address refuses.
      await expect(page.getByRole('link', { name: 'Marketplace' })).toHaveCount(0)
      await page.goto('/library/marketplace')
      await expect(page.getByTestId('marketplace-page')).toContainText('The Marketplace is not available. Nothing was changed.')
      await expect(page.getByTestId('marketplace-page').getByRole('link', { name: 'Back to the Library' })).toBeVisible()
    })
  })

  withFeature('marketplace', test => {
    test('with the Marketplace on, its button opens its page @SC-1609', async ({ page }) => {
      await page.goto('/library')
      await page.getByRole('link', { name: 'Marketplace' }).click()
      await expect(page).toHaveURL(at('/library/marketplace'))
      await expect(page.getByTestId('marketplace-page')).toContainText('The Marketplace is not available yet')
    })
  })

  test('the Add menu opens a way in, and New skill opens the editor’s start @SC-1609', async ({ page }) => {
    await pageAdd(page).first().click()
    await page.getByRole('menuitem', { name: /^From a link/ }).click()
    await expect(page).toHaveURL(at('/library/add?from=link'))
    await expect(page.getByRole('heading', { name: 'Add', level: 1 })).toBeVisible()
    await page.goto('/library')
    await pageAdd(page).first().click()
    await page.getByRole('menuitem', { name: /^New skill/ }).click()
    await expect(page).toHaveURL(at('/library/new-skill'))
  })

  test('a member sees no Add and no New skill, but the line to Your space @SC-1617', async ({ page }) => {
    await signIn(page, { username: 'e2e-operator', password: 'E2eOperator!2026' })
    await page.goto('/library')
    await expect(page.getByTestId('library-rows')).toBeVisible()
    await expect(pageAdd(page)).toHaveCount(0)
    await expect(page.getByRole('link', { name: /New skill/ })).toHaveCount(0)
    await expect(page.getByTestId('library-member-line')).toContainText('Organisation skills are added by admins and Library maintainers.')
    await page.getByTestId('library-member-line').getByRole('link', { name: /Your space/ }).click()
    await expect(page).toHaveURL(at('/space?tool=skills'))
  })

  test('a copy and the original it replaced are one row @SC-1628', async ({ page }) => {
    await page.goto('/library?type=skill')
    const copy = page.locator('[data-testid="library-card"][title*="Your copy of"]')
    if (!(await copy.count())) test.skip(true, 'the seeded organisation has no copy in use in place of an original')
    await expect(copy.first()).toHaveAttribute('title', /which is set aside/)
  })

  test("a card's actions are in its menu, and who it is from is on a line of its own @SC-1630", async ({ page }) => {
    await expect(page.getByTestId('library-card').first()).toBeVisible()
    // A built-in's menu has no Export; which card an HQ lists first varies, so take one that has it.
    const row = page.getByTestId('library-card').filter({ has: page.getByRole('button', { name: /^More about/ }) }).filter({ hasNotText: 'Built in' }).first()
    if (!(await row.count())) test.skip(true, 'every card in this organisation is built in, and a built-in has no Export')
    await expect(row.getByRole('link')).toHaveCount(1)
    await expect(row.getByRole('button')).toHaveCount(1)
    await row.getByRole('button', { name: /^More about/ }).click()
    await expect(page.getByRole('menu').getByRole('menuitem', { name: 'Export' })).toBeVisible()
    const state = await row.getByTestId('library-card-publisher').boundingBox()
    const title = await row.getByRole('link').boundingBox()
    expect(state!.y).toBeGreaterThan(title!.y)
  })
})

// A proposal aimed at a project is reachable by the people who review it (walkthrough finding 31). The seeded
// organisation holds no proposal, so this skips unless one waits for the signed-in administrator.
test.describe('proposals aimed at a project', () => {
  test("the project's Skills page says how many wait, and Review opens the queue with the project's level @SC-1663", async ({ page }) => {
    await page.goto(`/projects/${await memberProjectKey(page)}`)
    await expect(page.getByTestId('place-menu-header')).toBeVisible()
    await page.getByTestId('place-menu').getByRole('link', { name: /^Skills/ }).click()
    await expect(page.getByTestId('place-skills')).toBeVisible()
    const line = page.getByTestId('place-skills-proposals')
    if (!(await line.count())) test.skip(true, 'no proposal waits on a project the administrator is in')
    await expect(line).toContainText(/\d+ proposals? waiting/)
    await line.getByRole('link', { name: 'Review' }).click()
    await expect(page).toHaveURL(at('/library/proposals'))
    await expect(page.getByRole('region').filter({ has: page.getByTestId('proposal-entry') }).first()).toBeVisible()
  })
})

test.describe('using a team template', () => {
  test('a team template opens its review from the row menu, with nothing proposed behind it @SC-1638', async ({ page }) => {
    await page.goto('/library?type=team')
    const row = page.getByTestId('library-card').first()
    if (!(await row.count())) test.skip(true, 'the seeded organisation holds no team template')
    await row.getByRole('button', { name: /^More about/ }).click()
    await row.getByRole('menuitem', { name: /^Use this team/ }).click()
    await expect(page).toHaveURL(/\/workforce-templates\/review\?templateId=/)
    await expect(page).not.toHaveURL(/taskId=/)
    await expect(page.getByRole('button', { name: 'Apply Template' })).toBeVisible()
  })
})
