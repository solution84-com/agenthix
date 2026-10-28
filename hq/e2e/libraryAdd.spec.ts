import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { signIn, ADMIN } from './fixtures/auth'

// Add (skills spec part 6; board U4): Agenthix's shelf, an upload and a link, each through the one check and its
// four states in their own words. Written against the seeded e2e organisation and the skills in hq's image; run by the
// lead against a running hq. Nothing here installs an unsigned or outside package: each dialog is cancelled.

test.use({ viewport: { width: 1280, height: 800 } })

async function open(page: Page, from?: 'shelf' | 'upload' | 'link') {
  await signIn(page, ADMIN)
  await page.goto(from ? `/library/add?from=${from}` : '/library/add')
}

test.describe('Add', () => {
  test('offers Agenthix, an upload and a link to install, and New skill to make', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('add-shelf')).toContainText('From Agenthix')
    await expect(page.getByTestId('add-upload')).toContainText('Upload a package')
    await expect(page.getByTestId('add-link')).toContainText('From a link')
    await expect(page.getByRole('link', { name: /New skill/ })).toBeVisible()
  })

  test('the shelf lists what ships with this HQ, narrowed by Suited to, which is a hint and not a lock', async ({ page }) => {
    await open(page, 'shelf')
    await expect(page.getByTestId('shelf')).toContainText('Nothing here reaches an agent until you install it and add it to one.')
    const items = page.getByTestId('shelf-item')
    await expect(items.first()).toBeVisible()
    const all = await items.count()
    const suited = page.getByLabel('Suited to')
    const options = await suited.locator('option').allTextContents()
    if (options.length > 1) {
      await suited.selectOption({ index: 1 })
      expect(await items.count()).toBeLessThanOrEqual(all)
      await suited.selectOption({ label: 'all' })
      await expect(items).toHaveCount(all)
    }
    await items.first().getByRole('button', { name: 'View' }).click()
    await expect(page.getByTestId('read-package')).toContainText('name:')
  })

  test("the shelf lists Agenthix's templates an administrator removed, to put back", async ({ page }) => {
    await open(page, 'shelf')
    const removed = page.getByTestId('removed-templates')
    if (!(await removed.count())) test.skip(true, "no Agenthix template is removed in the seeded organisation")
    await expect(removed).toContainText("HQ doesn't install these again when it starts.")
    await expect(removed.getByRole('button', { name: 'Put back' }).first()).toBeVisible()
  })

  test('installing from the shelf says Signed by Agenthix, and Cancel changes nothing', async ({ page }) => {
    await open(page, 'shelf')
    const item = page.getByTestId('shelf-item').filter({ has: page.getByRole('button', { name: /^(Install|Get)/ }) }).first()
    await item.getByRole('button', { name: /^(Install|Get)/ }).click()
    const dialog = page.getByTestId('install-trusted')
    await expect(dialog).toContainText('✓ Signed by')
    await expect(dialog).toContainText('The signature was checked.')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('installed-notice')).toHaveCount(0)
  })

  test('an unsigned folder says so and keeps Install off until “I’ve read it” is ticked', async ({ page }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'add-'))
    const folder = path.join(dir, 'legal-review')
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, 'SKILL.md'), '---\nname: legal-review\ndescription: Reviews a contract. Use when asked to check a contract.\n---\n\n# Legal Review\n\nRead the contract.\n')
    await open(page, 'upload')
    await page.getByTestId('upload-folder').setInputFiles(folder)
    await page.getByRole('button', { name: 'Check it' }).click()
    const dialog = page.getByTestId('install-unsigned')
    await expect(dialog).toContainText("This isn't signed. Agenthix can't tell who made it or whether it was changed on the way. Read it before you install it.")
    const install = dialog.getByRole('button', { name: 'Install' })
    await expect(install).toBeDisabled()
    await dialog.getByRole('button', { name: 'Read it' }).click()
    await expect(page.getByTestId('read-package')).toContainText('Read the contract.')
    await dialog.getByLabel("I've read it").check()
    await expect(install).toBeEnabled()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('a link that is not https is refused in words, before anything is fetched', async ({ page }) => {
    await open(page, 'link')
    await page.getByLabel('Link to the package').fill('http://example.com/seo-audit.zip')
    await page.getByRole('button', { name: 'Check it' }).click()
    await expect(page.getByRole('heading', { name: "Can't install this" })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Nothing was changed.')
    await page.getByRole('button', { name: 'Close' }).click()
  })

  test('a member who may not install sees why, not a broken screen', async ({ page }) => {
    await signIn(page, { username: 'e2e-operator', password: 'E2eOperator!2026' })
    await page.goto('/library/add')
    await expect(page.getByTestId('add-not-allowed')).toContainText('Adding to the Library is for administrators and Library maintainers')
  })
})
