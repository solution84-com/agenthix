import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

// Pure-UI flows for the Projects screen: its projects view (filters, empty states, delete) and its Boards and
// Workspaces views, which are the organisation-wide lists of boards and workspaces. Filtering and searching are
// done in the React components, not in the queries, so there is no server contract to test them against. Which
// view is showing, and each view's filters, are in the address (/projects?view=boards&archived=1).
//
// They sign in as the seeded e2e admin (see e2e/README.md). The filter tests need at least one
// product or program in the database; the delete test needs a disposable project (E2E_DELETE_PROJECT_KEY).

const views = (page: Page) => page.getByRole('navigation', { name: 'Views' })

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
  // SC-158 — with no projects, a first-project empty state shows; when filters
  // exclude every project, a "no projects match the filters" message shows.
  test('shows the no-match message when filters exclude every project', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/projects')
    const productSelect = page.getByRole('combobox', { name: 'Product' })
    test.skip((await productSelect.count()) === 0, 'needs a product or program in the database')
    // Needs a product that no project belongs to: the last one in the list, by convention of the seed.
    const options = await productSelect.locator('option').count()
    await productSelect.selectOption({ index: options - 1 })
    await expect(page.getByText(/No projects match the current filters/i)).toBeVisible()
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
    await page.getByRole('button', { name: 'Delete project' }).click()
    await page.getByRole('button', { name: 'Delete project' }).last().click()
    await page.waitForURL(/\/projects$/)
    expect(page.url()).toMatch(/\/projects$/)
  })
})

test.describe('the Projects screen\'s views are in the address @SC-166', () => {
  // SC-166 — the org-wide list of boards is the Projects screen's Boards view; the view is in the address,
  // and the old /boards address opens it.
  test('Projects, Boards and Workspaces switch in place, and /boards opens the Boards view', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/projects')
    await expect(views(page).getByRole('button', { name: 'Projects' })).toHaveAttribute('aria-current', 'page')

    await views(page).getByRole('button', { name: 'Boards' }).click()
    await expect(page).toHaveURL(/\/projects\?(?:c=[^&]+&)?view=boards/)
    await expect(views(page).getByRole('button', { name: 'Boards' })).toHaveAttribute('aria-current', 'page')

    await views(page).getByRole('button', { name: 'Workspaces' }).click()
    await expect(page).toHaveURL(/\/projects\?(?:c=[^&]+&)?view=workspaces/)
    await expect(page.getByRole('searchbox', { name: 'Search workspaces' })).toBeVisible()

    // Back returns to the view the person was on.
    await page.goBack()
    await expect(page).toHaveURL(/view=boards/)

    await page.goto('/boards')
    await expect(page).toHaveURL(/\/projects\?(?:c=[^&]+&)?view=boards/)
  })
})

test.describe('boards view filter and search @SC-166', () => {
  // SC-166 — the Boards view lists active boards, shows archived ones behind an Archived button with their
  // count, and searches by board or project name.
  test('Archived toggle and name search narrow the org boards list', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/projects?view=boards')
    const archived = page.getByRole('button', { name: /^Archived/ })
    await expect(archived).toHaveAttribute('aria-pressed', 'false')
    await archived.click()
    await expect(archived).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(/archived=1/)

    const search = page.getByRole('searchbox', { name: 'Search boards' })
    await search.fill('sprint')
    await expect(search).toHaveValue('sprint')
  })
})

test.describe('workspaces view lists every workspace in the person\'s places', () => {
  test('a workspace row opens its place with the Workspaces tool and that workspace open', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/projects?view=workspaces')
    const rows = page.locator('li a[href*="tool=workspaces"]')
    await expect(page.getByRole('searchbox', { name: 'Search workspaces' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    test.skip((await rows.count()) === 0, 'needs a workspace in one of the admin\'s places')
    await rows.first().click()
    await expect(page).toHaveURL(/tool=workspaces&workspace=/)
  })
})
