import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { signIn, ADMIN } from './fixtures/auth'
import { at } from './fixtures/address'
import { memberProjectKey } from './fixtures/memberProject'

// A place's Skills page (skills spec part 6; boards P1, P2): the Skills entry under Agents at work in Your space and in a
// project, the page's header, default and groups, and its dialogs. Written against the seeded e2e organisation; run by
// the lead against a running hq.

test.use({ viewport: { width: 1440, height: 900 } })
// These specs change and read one place's settings and skills (Your space), so they run one after another.
test.describe.configure({ mode: 'serial' })

const placeMenu = (page: Page) => page.getByTestId('place-menu')
const sections = (page: Page) => placeMenu(page).getByRole('list', { name: 'Your space sections' })

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

  test('has a Skills entry after Workflows, and the page says your skills follow you or stay home @SC-1642 @SC-1648', async ({ page }) => {
    const labels = await sections(page).getByRole('link').allTextContents()
    const index = (name: string) => labels.findIndex(t => t.startsWith(name))
    expect(index('Skills')).toBeGreaterThan(index('Automation'))
    expect(index('Skills')).toBeLessThan(index('Files'))
    await expect(page.getByRole('heading', { name: 'Your skills' })).toBeVisible()
    await page.getByRole('button', { name: /^Skills found in files:/ }).click()
    await expect(page.getByTestId('yours-banner')).toContainText(/Your skills (follow you|stay in Your space)/)
    await expect(page.getByTestId('place-skills-counts')).toContainText(/\d+ on/)
  })

  test('the default is a labelled setting with the organisation\'s in words, and a looser choice is unavailable @SC-1642', async ({ page }) => {
    // The setting is one header button that opens in place.
    await page.getByRole('button', { name: /^Skills found in files:/ }).click()
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
    try {
      await select.selectOption('NEVER')
      await expect(page.getByText('Skills in files aren\'t read here.').or(page.getByText('No skills found in this place yet.'))).toBeVisible()
    } finally {
      await select.selectOption(before)
    }
    await expect(select).toHaveValue(before)
  })

  test('Add lists the installed skills and what to add them for @SC-1647', async ({ page }) => {
    await page.getByRole('button', { name: /Add/ }).click()
    await page.getByRole('menuitem', { name: /From the Library/ }).click()
    const dialog = page.getByTestId('add-to-place-dialog')
    await expect(dialog.getByRole('radio', { name: /Every agent/ })).toBeChecked()
    await expect(dialog.getByRole('button', { name: 'Add' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('New skill opens the editor for this place @SC-1624', async ({ page }) => {
    await page.getByRole('button', { name: /Add/ }).click()
    await page.getByRole('menuitem', { name: /New skill/ }).click()
    await expect(page).toHaveURL(/\/library\/new-skill\?place=/)
  })

  test('a skill added from the Library says what it is based on, and Update… shows what would change before it writes @SC-1647', async ({ page }) => {
    const row = page.getByTestId('place-skill-row').filter({ has: page.getByRole('button', { name: 'Update…' }) }).first()
    if (!(await row.count())) test.skip(true, 'no skill here was added from the Library at a version older than the one it pins')
    await expect(row.getByTestId('place-skill-words')).toContainText(/A copy of \S+ \S+ from the Library · .* · \S+ available/)
    await row.getByRole('button', { name: 'Update…' }).click()
    const dialog = page.getByTestId('place-skill-update')
    await expect(dialog).toContainText('Updating writes')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('All on, in a group\'s ⋯, names what it would switch before it does @SC-1642', async ({ page }) => {
    if (!(await page.getByTestId('place-skill-group').count())) test.skip(true, 'no skills found in this place: no group to switch')
    await page.getByTestId('place-skill-group').first().getByRole('button', { name: /^More about/ }).click()
    const allOn = page.getByRole('menuitem', { name: /^All on/ })
    if (await allOn.isDisabled()) test.skip(true, 'Files are not read here: All on has nothing to switch')
    await allOn.click()
    await expect(page.getByTestId('confirm-switch-all')).toBeVisible()
    await page.getByTestId('confirm-switch-all').getByRole('button', { name: 'Cancel' }).click()
  })
})

test.describe('a project: what agents find here', () => {
  test('has the Skills page under Agents at work, with groups by where each skill was found @SC-1642', async ({ page }) => {
    await page.goto(`/projects/${await memberProjectKey(page)}`)
    const panel = page.getByTestId('place-menu-header')
    await expect(panel).toBeVisible()
    await placeMenu(page).getByRole('link', { name: /^Skills/ }).click()
    await expect(page.getByRole('heading', { name: 'Skills' })).toBeVisible()
    await page.getByRole('button', { name: /^Skills found in files:/ }).click()
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
  // A new name each time: a skill that was published and switched on once is a record HQ keeps, and a second run would meet it.
  let NAME = ''
  const file = () => join(DIR!, NAME, 'SKILL.md')
  const row = (page: Page) => page.getByTestId('place-skill-row').filter({ hasText: NAME })

  test.beforeEach(async ({ page }) => {
    NAME = `e2e-switch-${Date.now() % 1000000}`
    mkdirSync(join(DIR!, NAME), { recursive: true })
    writeFileSync(file(), `---\nname: ${NAME}\ndescription: Checks that a switch goes off when the files change.\n---\nSay hello.\n`)
    await page.goto('/space?tool=skills')
    // Files are read only when the place's default isn't Never; the scenarios need them read, whatever it was left at.
    await page.getByRole('button', { name: /^Skills found in files:/ }).click()
    const find = page.getByTestId('place-default-line').getByLabel('Skills found in files')
    if ((await find.inputValue()) === 'NEVER') await find.selectOption('OFF')
    await page.getByRole('button', { name: 'Look at the files again' }).click()
  })
  test.afterEach(() => rmSync(join(DIR!, NAME), { recursive: true, force: true }))

  test('publish from the files with a note, switch on, a change turns it off and says why, put back keeps it on @SC-1644', async ({ page }) => {
    await expect(row(page)).toContainText('off until you publish it')
    await row(page).getByRole('button', { name: 'Publish…' }).click()
    const publish = page.getByTestId('skill-files-dialog')
    await expect(publish.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled()
    await publish.getByLabel(/Note/).fill('First version')
    await publish.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(publish).toBeHidden()
    await expect(row(page).getByTestId('place-skill-words')).toContainText('Version 1')

    await row(page).getByRole('switch').click()
    await page.getByTestId('skill-files-dialog').getByRole('button', { name: 'Switch on' }).click()
    await expect(row(page).getByRole('switch')).toHaveAttribute('aria-checked', 'true')

    appendFileSync(file(), 'Then say goodbye.\n')
    await page.getByRole('button', { name: 'Look at the files again' }).click()
    await expect(row(page).getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    await expect(row(page).getByTestId('place-skill-switched-off')).toContainText('Switched off: its files changed since')
    await row(page).getByRole('button', { name: 'See the change' }).click()
    await expect(page.getByTestId('skill-files-dialog')).toContainText('SKILL.md')
    await page.getByTestId('skill-files-dialog').getByRole('button', { name: 'Close' }).click()

    await row(page).getByRole('button', { name: /^More about/ }).click()
    await page.getByRole('menuitem', { name: /Put back version 1/ }).click()
    await page.getByTestId('skill-files-dialog').getByRole('button', { name: 'Put back' }).click()
    await expect(row(page).getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await page.reload()
    await expect(row(page).getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await expect(row(page).getByTestId('place-skill-switched-off')).toHaveCount(0)
  })

  test('a skill never published says why its switch went off too @SC-1645', async ({ page }) => {
    await row(page).getByRole('switch').click()
    await page.getByTestId('skill-files-dialog').getByRole('button', { name: 'Switch on' }).click()
    await expect(row(page).getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    appendFileSync(file(), 'Changed.\n')
    await page.getByRole('button', { name: 'Look at the files again' }).click()
    await expect(row(page).getByTestId('place-skill-switched-off')).toContainText('Switched off: its files changed since')
    await expect(row(page).getByRole('button', { name: 'See the change' })).toBeVisible()
  })
})
