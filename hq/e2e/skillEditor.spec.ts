import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

// The editor (skills spec part 6, board U3b): New skill, the file tree with change markers, View / Edit / Changes,
// checks as the person edits, the draft saving itself, Publish saying why it can't be used, the version written into
// SKILL.md on publish, and Ask an agent naming who answers. Written against the seeded e2e organisation; run by the lead.

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
  await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0)
  await expect(page.getByTestId('draft-state')).toHaveText('Saved')
})

test('Publish says why it can’t be used while a change is saving, and once nothing changed', async ({ page }) => {
  await page.goto('/library/new-skill')
  await page.getByLabel('Name').fill(`e2e-why-${Date.now() % 100000}`)
  await page.getByLabel('What it does, and when to use it').fill('Does a thing. Use when asked.')
  await page.getByRole('button', { name: 'Create draft' }).click()
  await page.getByRole('tab', { name: 'Edit' }).click()
  await page.getByTestId('edit-file').locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nOne more step.\n')
  await expect(page.getByRole('button', { name: 'Publish…' })).toBeDisabled()
  await expect(page.getByTestId('publish-why')).toContainText('once they are saved')
  await expect(page.getByTestId('draft-state')).toHaveText('Saved')
  await expect(page.getByRole('button', { name: 'Publish…' })).toBeEnabled()
  await expect(page.getByTestId('publish-why')).toHaveCount(0)

  await page.getByRole('button', { name: 'Publish…' }).click()
  await page.getByLabel(/Note/).fill('First version')
  await page.getByRole('button', { name: 'Publish version 1.0.0' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('publish-why')).toHaveText('Nothing has changed since version 1.0.0, the version in use.')
})

test('publishing writes the version it makes into SKILL.md, and the editor says it will', async ({ page }) => {
  await page.goto('/library/new-skill')
  await page.getByLabel('Name').fill(`e2e-ver-${Date.now() % 100000}`)
  await page.getByLabel('What it does, and when to use it').fill('Does a thing. Use when asked.')
  await page.getByRole('button', { name: 'Create draft' }).click()
  await page.getByRole('tab', { name: 'Edit' }).click()
  await expect(page.getByTestId('version-on-publish')).toBeVisible()
  await page.getByRole('button', { name: 'Publish…' }).click()
  await page.getByLabel(/Note/).fill('First version')
  await page.getByRole('button', { name: 'Publish version 1.0.0' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('tab', { name: 'Edit' }).click()
  await expect(page.getByTestId('edit-file')).toContainText('version: 1.0.0')
})

test('Ask an agent names the agent that will answer and where, and lets the person pick another', async ({ page }) => {
  await page.goto('/library/new-skill')
  await page.getByLabel('Name').fill(`e2e-ask-${Date.now() % 100000}`)
  await page.getByLabel('What it does, and when to use it').fill('Does a thing. Use when asked.')
  await page.getByRole('radio', { name: /Ask an agent to write it/ }).check()
  await expect(page.getByTestId('ask-who')).toHaveText(/^.+ will answer, in a new conversation in Your space\.$/)
  await expect(page.getByRole('button', { name: 'Agent' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Ask .+/ })).toBeEnabled()

  await page.getByRole('radio', { name: /A plain skill/ }).check()
  await page.getByRole('button', { name: 'Create draft' }).click()
  await page.getByRole('button', { name: 'Ask an agent to edit' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ask an agent to edit' })
  await expect(dialog.getByTestId('ask-who')).toContainText('will answer, in a new conversation in Your space.')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
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
