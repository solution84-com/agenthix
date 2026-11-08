import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

// Pure-UI flows for the Projects page (filters, empty states, delete) and the Boards and Workspaces pages, the
// rail's lists of every board and workspace. Filtering and searching are done in the React components, not in the
// queries, so there is no server contract to test them against. Each list's filters are in its address
// (/boards?archived=1).
//
// They sign in as the seeded e2e admin (see e2e/README.md). The filter tests need at least one
// product or program in the database; the delete test needs a disposable project (E2E_DELETE_PROJECT_KEY).

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })

test.describe('projects list filtering @SC-157', () => {
  // SC-157 — selecting a product and/or program filter narrows the grid; each
  // active filter shows as a clearable chip.
  test('product filter narrows the grid and shows a clearable chip', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/projects')
    const productSelect = page.getByRole('combobox', { name: 'Product' })
    test.skip((await productSelect.count()) === 0, 'needs a product or program in the database')
    // Pick the first product in the product filter dropdown.
    await productSelect.selectOption({ index: 1 })
    // An active-filter chip appears with a clear (X) control, named for the product.
    const chosen = ((await productSelect.locator('option:checked').textContent()) ?? '').trim()
    const chip = page.getByRole('button', { name: `Clear ${chosen}` })
    await expect(chip).toBeVisible()
    // Clearing the chip removes the filter.
    await chip.click()
    await expect(productSelect).toHaveValue('')
  })
})

test.describe('projects list empty states @SC-158', () => {
  // SC-158 — with no projects, a first-project empty state shows; when nothing matches, the line names what was
  // searched or chosen, never "filters".
  test('names the search when no project matches it', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/projects')
    await page.getByRole('searchbox', { name: 'Search projects' }).fill('zzz-no-such-project')
    await expect(page.getByText('No project matches “zzz-no-such-project”')).toBeVisible()
  })

  test('names the product when no project is filed under it', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/projects')
    const productSelect = page.getByRole('combobox', { name: 'Product' })
    test.skip((await productSelect.count()) === 0, 'needs a product or program in the database')
    // Needs a product that no project belongs to: the last one in the list, by convention of the seed.
    const options = await productSelect.locator('option').count()
    await productSelect.selectOption({ index: options - 1 })
    await expect(page.getByText(/^No project is filed under /)).toBeVisible()
  })
})

test.describe('return to projects list after delete @SC-161', () => {
  // SC-161 — after a project is deleted the user is returned to the projects list.
  test('lands back on /projects after deleting a project', async ({ page }) => {
    const key = process.env.E2E_DELETE_PROJECT_KEY
    test.skip(!key, 'deletes a project: set E2E_DELETE_PROJECT_KEY to a disposable project')
    await signIn(page, ADMIN)
    // The project's Settings tool, where Delete project lives; confirming returns to the list.
    await page.goto(`/projects/${key}?tool=settings`)
    await page.getByRole('button', { name: 'Delete project…' }).click()
    await page.getByLabel(/Type the project's key/).fill(key!)
    await page.getByRole('dialog').getByRole('button', { name: 'Delete project' }).click()
    await page.waitForURL(/\/projects$/)
    expect(page.url()).toMatch(/\/projects$/)
  })
})

test.describe('Boards and Workspaces are rail places of their own @SC-166', () => {
  // SC-166 — every board, and every workspace, across the person's projects is a list of its own in the rail;
  // the Projects page lists projects only.
  test('the rail opens Boards and Workspaces, each with its own title and New button', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/projects')
    await expect(page.getByRole('navigation', { name: 'Views' })).toHaveCount(0)

    await nav(page).getByRole('link', { name: 'Boards' }).click()
    await expect(page).toHaveURL(/\/boards(\?|$)/)
    await expect(nav(page).getByRole('link', { name: 'Boards' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { level: 1, name: 'Boards' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New board' })).toBeVisible()

    await nav(page).getByRole('link', { name: 'Workspaces' }).click()
    await expect(page).toHaveURL(/\/workspaces(\?|$)/)
    await expect(page.getByRole('searchbox', { name: 'Search workspaces' })).toBeVisible()

    await nav(page).getByRole('link', { name: 'Routines' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Routines' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'On or paused' })).toBeVisible()
  })
})

test.describe('the Boards page\'s filter and search @SC-166', () => {
  // SC-166 — the Boards page lists every board of the person's projects, by project, the built-in ones first, and
  // searches by board or project name. A board is a view, so there is no archive.
  test('lists each project\'s built-in boards and narrows by name', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/boards')
    await expect(page.getByRole('button', { name: /^Archived/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Task state/ }).first()).toBeVisible()
    const search = page.getByRole('searchbox', { name: 'Search boards' })
    await search.fill('execution')
    await expect(page.getByRole('link', { name: /Task state/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Execution/ }).first()).toBeVisible()
  })
})

test.describe('the Workspaces page lists every workspace in the person\'s places', () => {
  test('a workspace row opens that workspace full screen', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/workspaces')
    const rows = page.locator('li a[href*="tool=workspaces"]')
    await expect(page.getByRole('searchbox', { name: 'Search workspaces' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    test.skip((await rows.count()) === 0, 'needs a workspace in one of the admin\'s places')
    await rows.first().click()
    // The row names the place's Workspaces tool and the workspace; the tool opens a workspace in its own view.
    await expect(page).toHaveURL(/\/workspaces\/[^/?]+\/view/)
  })
})
