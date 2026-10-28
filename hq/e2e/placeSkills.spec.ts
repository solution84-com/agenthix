import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { at } from './fixtures/address'

// A place's Skills page (skills spec part 6; boards P1, P2): the Skills entry under Agents at work in Your space and in a
// project, the page's header, default and groups, and its dialogs. Written against the seeded e2e organisation; run by
// the lead against a running hq.

test.use({ viewport: { width: 1440, height: 900 } })

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })
const sections = (page: Page) => nav(page).getByRole('list', { name: 'Your space sections' })

test.beforeEach(async ({ page }) => {
  await signIn(page, ADMIN)
})

test.describe('Your space: your skills', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/space')
    await sections(page).getByRole('link', { name: /^Skills/ }).click()
    await expect(page).toHaveURL(at('/space?tool=skills'))
    await expect(page.getByTestId('place-skills-counts')).toBeVisible()
  })

  test('has a Skills entry after Workflows, and the page says your skills follow you or stay home', async ({ page }) => {
    const labels = await sections(page).getByRole('link').allTextContents()
    const index = (name: string) => labels.findIndex(t => t.startsWith(name))
    expect(index('Skills')).toBeGreaterThan(index('Automation'))
    expect(index('Skills')).toBeLessThan(index('Files'))
    await expect(page.getByRole('heading', { name: 'Your skills' })).toBeVisible()
    await expect(page.getByTestId('yours-banner')).toContainText(/Your skills (follow you|stay in Your space)/)
    await expect(page.getByTestId('place-skills-counts')).toContainText(/\d+ on/)
  })

  test('shows the default in words, and the person can change it', async ({ page }) => {
    await expect(page.getByTestId('place-default-line')).toContainText(/On by default|Off by default|Never/)
    await page.getByTestId('place-default-line').getByRole('button', { name: 'Change' }).click()
    const dialog = page.getByTestId('place-default-dialog')
    await expect(dialog.getByRole('radio', { name: /Never/ })).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })

  test('Add lists the installed skills and what to add them for', async ({ page }) => {
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const dialog = page.getByTestId('add-to-place-dialog')
    await expect(dialog.getByRole('radio', { name: /Every agent/ })).toBeChecked()
    await expect(dialog.getByRole('button', { name: 'Add' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('New skill opens the editor for this place', async ({ page }) => {
    await page.getByRole('link', { name: 'New skill' }).click()
    await expect(page).toHaveURL(/\/library\/new-skill\?place=/)
  })

  test('a skill added from the Library says what it is based on, and Update… shows what would change before it writes', async ({ page }) => {
    const row = page.getByTestId('place-skill-row').filter({ has: page.getByRole('button', { name: 'Update…' }) }).first()
    if (!(await row.count())) test.skip(true, 'no skill here was added from the Library at a version older than the one it pins')
    await expect(row.getByTestId('place-skill-words')).toContainText(/based on \S+ \S+ · \S+ available/)
    await row.getByRole('button', { name: 'Update…' }).click()
    const dialog = page.getByTestId('place-skill-update')
    await expect(dialog).toContainText('Updating writes')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('All on names what it would switch before it does', async ({ page }) => {
    await page.getByRole('button', { name: 'All on' }).first().click()
    await expect(page.getByTestId('confirm-switch-all')).toBeVisible()
    await page.getByTestId('confirm-switch-all').getByRole('button', { name: 'Cancel' }).click()
  })
})

test.describe('a project: what agents find here', () => {
  test('has the Skills page under Agents at work, with groups by where each skill was found', async ({ page }) => {
    await page.goto('/projects')
    await page.getByRole('link', { name: /Open|View/ }).first().click().catch(() => {})
    const first = page.locator('a[href^="/projects/"]').first()
    await first.click()
    const panel = page.getByTestId('place-panel-header')
    await expect(panel).toBeVisible()
    await nav(page).getByRole('link', { name: /^Skills/ }).click()
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible()
    await expect(page.getByText(/Anyone who can write the project's files edits these skills/)).toBeVisible()
    await expect(page.getByTestId('place-default-line')).toBeVisible()
  })
})
