import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

// The editor (skills spec part 6, board U3b): New skill, the file tree with change markers, View / Edit / Changes,
// checks as the person edits, and Publish. Written against the seeded e2e organisation; run by the lead.

test.use({ viewport: { width: 1280, height: 800 } })

test.beforeEach(async ({ page }) => { await signIn(page, ADMIN) })

test('New skill checks the name as it is typed, then opens the editor on a draft', async ({ page }) => {
  await page.goto('/library/new-skill')
  await page.getByLabel('Name').fill('Release Notes')
  await expect(page.getByRole('alert')).toContainText('lowercase letters')
  await page.getByLabel('Name').fill(`e2e-notes-${Date.now() % 100000}`)
  await page.getByLabel('What it does, and when to use it').fill('Write release notes. Use when asked for a changelog.')
  await page.getByRole('radio', { name: /A skill with scripts/ }).check()
  await page.getByRole('button', { name: 'Create draft' }).click()
  await expect(page.getByTestId('skill-editor')).toBeVisible()
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()
  await expect(page.getByTestId('editor-tree')).toContainText('scripts/README.md')
  await expect(page.getByTestId('editor-tree')).toContainText('references/README.md')
})

test('editing a file marks it modified, shows its changes, and flags a file SKILL.md names that is missing', async ({ page }) => {
  await page.goto('/library/new-skill')
  const name = `e2e-edit-${Date.now() % 100000}`
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('What it does, and when to use it').fill('Does a thing. Use when asked.')
  await page.getByRole('button', { name: 'Create draft' }).click()
  await page.getByRole('tab', { name: 'Edit' }).click()
  const editor = page.getByTestId('edit-file').locator('.cm-content')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nRun scripts/format.py\n')
  await expect(page.getByTestId('editor-checks')).toContainText('names scripts/format.py, which isn’t in the skill')
  await page.getByRole('tab', { name: 'Changes' }).click()
  await expect(page.getByTestId('editor-changes')).toContainText('format.py')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText(/Saved as revision/)).toBeVisible()
})

test('Publish shows every changed file, asks for a note, and the first publish is version 1.0.0', async ({ page }) => {
  await page.goto('/library/new-skill')
  await page.getByLabel('Name').fill(`e2e-pub-${Date.now() % 100000}`)
  await page.getByLabel('What it does, and when to use it').fill('Does a thing. Use when asked.')
  await page.getByRole('button', { name: 'Create draft' }).click()
  await page.getByRole('button', { name: 'Publish…' }).click()
  await expect(page.getByRole('heading', { name: 'Publish version 1.0.0' })).toBeVisible()
  await expect(page.getByTestId('publish-summary')).toContainText('1 file changed')
  await expect(page.getByRole('button', { name: 'Publish version 1.0.0' })).toBeDisabled()
  await page.getByLabel(/Note/).fill('First version')
  await page.getByRole('button', { name: 'Publish version 1.0.0' }).click()
  await expect(page.getByRole('link', { name: 'Add to agents…' })).toBeVisible()
})
