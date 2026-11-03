import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { at } from './fixtures/address'
import { memberProjectKey } from './fixtures/memberProject'
import { withFeature, withFeatureOff } from './fixtures/withFeature'

// The Library in the navigation (skills spec part 6): its place among the places, the one searched view with its
// Type and Show filters, and the Marketplace button behind its flag (off as shipped; on in its own group). Written against the seeded e2e organisation;
// run by the lead against a running hq.

test.use({ viewport: { width: 1280, height: 800 } })
// One worker, in order: the Marketplace's tests switch the organisation's flag, and its as-shipped test needs it off.
test.describe.configure({ mode: 'default' })

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })

test.beforeEach(async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/')
  await expect(nav(page)).toBeVisible()
})

test.describe('the Library in the navigation', () => {
  test('comes after Agents, and Tasks comes before Agents @SC-1630', async ({ page }) => {
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

  test('lists what is installed in one view, with a chip for each type and each state @SC-1630', async ({ page }) => {
    await expect(page.getByTestId('library-row').first()).toBeVisible()
    const type = page.getByRole('group', { name: 'Type' })
    for (const t of ['All', 'Skills', 'Agents', 'Boards', 'Teams']) await expect(type.getByRole('button', { name: new RegExp(`^${t}`) })).toBeVisible()
    const show = page.getByRole('group', { name: 'Show' })
    for (const s of ['Waiting for review', 'Update available', 'Draft', 'No agent yet', 'Set aside', 'Unsigned']) {
      await expect(show.getByRole('button', { name: new RegExp(`^${s}`) })).toBeVisible()
    }
  })

  test('a Type chip narrows the list to that type and keeps it in the address @SC-1630', async ({ page }) => {
    await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^Boards/ }).click()
    await expect(page).toHaveURL(/type=board/)
    const rows = page.getByTestId('library-row')
    await expect(rows.first()).toContainText('board ·')
    await expect(rows.filter({ hasNotText: 'board ·' })).toHaveCount(0)
    await page.getByRole('group', { name: 'Type' }).getByRole('button', { name: /^All/ }).click()
    await expect(page).not.toHaveURL(/type=/)
  })

  test('a Show chip narrows by state and a second click clears it @SC-1630', async ({ page }) => {
    const chip = page.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^Unsigned/ })
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/show=unsigned/)
    await expect(page.getByTestId('library-row').filter({ hasNotText: 'Unsigned' })).toHaveCount(0)
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  test('the search finds an asset of any type and says when nothing matches @SC-1630', async ({ page }) => {
    const search = page.getByRole('searchbox')
    await search.fill('zzz-nothing-is-called-this')
    await expect(page.getByText('Nothing matches.')).toBeVisible()
    await expect(page.getByTestId('library-row')).toHaveCount(0)
    await search.fill('')
    await expect(page.getByTestId('library-row').first()).toBeVisible()
  })

  withFeatureOff('marketplace', test => {
    test('the administrator sees Add skill, New skill and Settings; as shipped there is no Marketplace @SC-1609', async ({ page }) => {
      // Opened again: the group switches the flag after the outer hooks have already opened the Library.
      await page.goto('/library')
      await expect(page.getByRole('link', { name: 'New skill' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Add skill', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
      // The Marketplace's flag is at preview, off as shipped (adr-0172): no button, and its address refuses.
      await expect(page.getByRole('link', { name: 'Marketplace' })).toHaveCount(0)
      await page.goto('/library/marketplace')
      await expect(page.getByTestId('marketplace-page')).toContainText('The Marketplace is not available. Nothing was changed.')
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

  test('Add skill is named for what it adds today, on the button and on its page @SC-1609', async ({ page }) => {
    await page.getByRole('link', { name: 'Add skill', exact: true }).click()
    await expect(page).toHaveURL(at('/library/add'))
    await expect(page.getByRole('heading', { name: 'Add skill', level: 1 })).toBeVisible()
  })

  test('a copy and the original it replaced are one row, found under Set aside @SC-1628', async ({ page }) => {
    const copy = page.getByTestId('library-row').filter({ hasText: 'Your copy of' })
    if (!(await copy.count())) test.skip(true, 'the seeded organisation has no copy in use in place of an original')
    await expect(copy.first().getByTestId('library-row-states')).toContainText('Original set aside')
    await page.getByRole('group', { name: 'Show' }).getByRole('button', { name: /^Set aside/ }).click()
    await expect(page.getByTestId('library-row').filter({ hasText: 'Your copy of' }).first()).toBeVisible()
    await expect(page.getByTestId('library-row').filter({ hasText: 'replaced by your copy' })).toHaveCount(0)
  })

  test("a row's actions are in its menu, and its states are on a line of their own @SC-1630", async ({ page }) => {
    await expect(page.getByTestId('library-row').first()).toBeVisible()
    // A built-in has no ⋯ menu; which row an HQ lists first varies, so take one that has it.
    const row = page.getByTestId('library-row').filter({ has: page.getByRole('button', { name: /^More about/ }) }).first()
    if (!(await row.count())) test.skip(true, 'every row in this organisation is built in, and a built-in has no menu')
    await expect(row.getByRole('link')).toHaveCount(1)
    await expect(row.getByRole('button')).toHaveCount(1)
    await row.getByRole('button', { name: /^More about/ }).click()
    await expect(page.getByRole('menu').getByRole('menuitem', { name: 'Export' })).toBeVisible()
    const withStates = page.getByTestId('library-row').filter({ has: page.getByTestId('library-row-states') }).first()
    if (await withStates.count()) {
      const text = await withStates.locator('div.min-w-0').boundingBox()
      const states = await withStates.getByTestId('library-row-states').boundingBox()
      expect(states!.y).toBeGreaterThan(text!.y)
    }
  })
})

// A proposal aimed at a project is reachable by the people who review it (walkthrough finding 31). The seeded
// organisation holds no proposal, so this skips unless one waits for the signed-in administrator.
test.describe('proposals aimed at a project', () => {
  test("the project's Skills page says how many wait, and Review opens the queue with the project's level @SC-1663", async ({ page }) => {
    await page.goto(`/projects/${await memberProjectKey(page)}`)
    await expect(page.getByTestId('place-panel-header')).toBeVisible()
    await nav(page).getByRole('link', { name: /^Skills/ }).click()
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
    const row = page.getByTestId('library-row').first()
    if (!(await row.count())) test.skip(true, 'the seeded organisation holds no team template')
    await row.getByRole('button', { name: /^More about/ }).click()
    await row.getByRole('menuitem', { name: /^Use this team/ }).click()
    await expect(page).toHaveURL(/\/workforce-templates\/review\?templateId=/)
    await expect(page).not.toHaveURL(/taskId=/)
    await expect(page.getByRole('button', { name: 'Apply Template' })).toBeVisible()
  })
})
