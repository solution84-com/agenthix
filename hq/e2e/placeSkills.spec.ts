import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
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

  test('the default is a labelled setting with the organisation\'s in words, and a looser choice is unavailable', async ({ page }) => {
    const line = page.getByTestId('place-default-line')
    const select = line.getByLabel('Skills found in files')
    await expect(select).toBeVisible()
    await expect(line.getByTestId('place-default-org')).toContainText(/The organisation's default is (on|off|never)/)
    // Nothing is a button to open: the select changes it in place.
    await expect(line.getByRole('button', { name: 'Change' })).toHaveCount(0)
    const org = (await line.getByTestId('place-default-org').textContent()) ?? ''
    if (/is off by default/.test(org)) {
      await expect(select.locator('option', { hasText: 'On by default' })).toBeDisabled()
      await expect(line.getByTestId('place-default-unavailable')).toContainText("isn't available")
    }
    const before = await select.inputValue()
    await select.selectOption('NEVER')
    await expect(page.getByText('Skills in files aren\'t read here.').or(page.getByText('No skills found in this place yet.'))).toBeVisible()
    await select.selectOption(before)
    await expect(select).toHaveValue(before)
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
    await expect(page.getByTestId('place-default-line').getByLabel('Skills found in files')).toBeVisible()
  })
})

// A skill found in the files: publish it with its note, switch it on, and when the files change it goes off and says
// why; putting the published version back turns it on and keeps it on. The spec writes the skill's folder straight
// into Your space's skills folder on the machine the site runs on (HQ has no operation that writes a place's file), so
// it needs E2E_SPACE_SKILLS_DIR: the administrator's `files/.agents/skills` folder under the site's storage.
test.describe('Your space: a skill found in files, switched on, then changed', () => {
  const DIR = process.env.E2E_SPACE_SKILLS_DIR
  test.skip(!DIR, 'needs E2E_SPACE_SKILLS_DIR: the e2e administrator\'s files/.agents/skills folder')
  const NAME = 'e2e-switch-check'
  const file = () => join(DIR!, NAME, 'SKILL.md')
  const row = (page: Page) => page.getByTestId('place-skill-row').filter({ hasText: NAME })

  test.beforeEach(async ({ page }) => {
    mkdirSync(join(DIR!, NAME), { recursive: true })
    writeFileSync(file(), `---\nname: ${NAME}\ndescription: Checks that a switch goes off when the files change.\n---\nSay hello.\n`)
    await page.goto('/space?tool=skills')
    await page.getByRole('button', { name: 'Look at the files again' }).click()
  })
  test.afterEach(() => rmSync(join(DIR!, NAME), { recursive: true, force: true }))

  test('publish from the files with a note, switch on, a change turns it off and says why, put back keeps it on', async ({ page }) => {
    await expect(row(page)).toContainText('in files, not published')
    await row(page).getByRole('button', { name: 'Publish as version 1' }).click()
    const publish = page.getByTestId('skill-files-dialog')
    await expect(publish.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled()
    await publish.getByLabel(/Note/).fill('First version')
    await publish.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(publish).toBeHidden()
    await expect(row(page).getByTestId('place-skill-words')).toContainText('version 1')

    await row(page).getByRole('switch').click()
    await page.getByTestId('skill-files-dialog').getByRole('button', { name: 'Switch on' }).click()
    await expect(row(page).getByRole('switch')).toHaveAttribute('aria-checked', 'true')

    appendFileSync(file(), 'Then say goodbye.\n')
    await page.getByRole('button', { name: 'Look at the files again' }).click()
    await expect(row(page).getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await expect(row(page).getByTestId('place-skill-switched-off')).toContainText('Switched off: its files changed since')
    await row(page).getByRole('button', { name: 'What changed' }).click()
    await expect(page.getByTestId('skill-files-dialog')).toContainText('SKILL.md')
    await page.getByTestId('skill-files-dialog').getByRole('button', { name: 'Close' }).click()

    await row(page).getByRole('button', { name: 'Put back version 1' }).click()
    await page.getByTestId('skill-files-dialog').getByRole('button', { name: 'Put back' }).click()
    await expect(row(page).getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await page.reload()
    await expect(row(page).getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await expect(row(page).getByTestId('place-skill-switched-off')).toHaveCount(0)
  })

  test('a skill never published says why its switch went off too', async ({ page }) => {
    await row(page).getByRole('switch').click()
    await page.getByTestId('skill-files-dialog').getByRole('button', { name: 'Switch on' }).click()
    await expect(row(page).getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    appendFileSync(file(), 'Changed.\n')
    await page.getByRole('button', { name: 'Look at the files again' }).click()
    await expect(row(page).getByTestId('place-skill-switched-off')).toContainText('Switched off: its files changed since')
    await expect(row(page).getByRole('button', { name: 'What changed' })).toBeVisible()
  })
})
