import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'

// An asset's page (skills spec part 6; boards U3 and U5): the same for every kind, reached from a row of the Library.
// Written against the seeded e2e organisation; run by the lead against a running hq. Changes that need a second
// version (update, roll back, own copy) are proved by the lifecycle's integration tests; here the page shows the
// sections and asks before it does anything.

test.use({ viewport: { width: 1280, height: 800 } })

async function openRow(page: Page, who = ADMIN, kind = 'skill'): Promise<void> {
  await signIn(page, who)
  await page.goto(`/library?type=${kind}`)
  await expect(page.getByTestId('library-row').first()).toBeVisible()
  await page.getByTestId('library-row').first().getByRole('link').first().click()
  await expect(page.getByTestId('asset-page')).toBeVisible()
}

test.describe("an asset's page", () => {
  test('a row opens a page with its own address, its content and its sections', async ({ page }) => {
    await openRow(page)
    await expect(page).toHaveURL(/\/library\/[^/]+$/)
    for (const id of ['asset-content', 'asset-versions', 'asset-who', 'asset-about']) await expect(page.getByTestId(id)).toBeVisible()
    await expect(page.getByTestId('asset-versions')).toContainText('In use')
    await expect(page.getByTestId('asset-who')).toContainText('Administrators and the Library maintainers')
    await expect(page.getByTestId('asset-about')).toContainText('Identity')
    await expect(page.getByTestId('asset-about')).toContainText('Signed')
  })

  test('a version can be viewed from the history', async ({ page }) => {
    await openRow(page)
    await page.getByTestId('asset-version').first().getByRole('button', { name: 'View' }).click()
    await expect(page.getByTestId('asset-version').first().getByTestId('asset-files')).toBeVisible()
  })

  test('an installed skill says which agents have it, and an administrator chooses', async ({ page }) => {
    await openRow(page)
    const holders = page.getByTestId('asset-holders')
    if (await holders.count()) {
      await expect(holders.getByRole('radio', { name: /Every agent/ })).toBeVisible()
      await expect(holders.getByRole('radio', { name: /Chosen agents/ })).toBeEnabled()
    }
  })

  test('Remove names the agents that have it and asks first; Cancel leaves it in the Library', async ({ page }) => {
    await openRow(page)
    const more = page.getByRole('button', { name: /^More about/ })
    if (!(await more.count())) test.skip(true, 'the first skill is built in: switched off in Settings, not removed')
    await more.click()
    await page.getByRole('menuitem', { name: /^Remove/ }).click()
    const dialog = page.getByRole('heading', { name: /^Remove / })
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('remove-reach')).toContainText(/(has|have) it\.|No agent has it\.|Every agent has it\./)
    await expect(page.getByText(/Its history is kept/)).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('asset-page')).toBeVisible()
  })

  test("a template's page says what it carries and what was made from it", async ({ page }) => {
    await openRow(page, ADMIN, 'agent')
    await expect(page.getByTestId('asset-carries')).toBeVisible()
    await expect(page.getByTestId('asset-made-from')).toContainText('Things made from a template are their own')
  })

  test("Remove on a template names what was made from it, says it stays as it is, and asks first", async ({ page }) => {
    await openRow(page, ADMIN, 'agent')
    await page.getByRole('button', { name: /^More about/ }).click()
    await page.getByRole('menuitem', { name: /^Remove/ }).click()
    await expect(page.getByTestId('remove-reach')).toContainText(/Nothing has been made from it\.|made from it\. (It stays as it is|They stay as they are)\./)
    await expect(page.getByText(/an administrator can put it back/)).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('asset-page')).toBeVisible()
  })

  test('About says when the skill was last used, or that HQ has not seen it used', async ({ page }) => {
    await openRow(page)
    await expect(page.getByTestId('asset-about')).toContainText(/Last used|Not used yet that HQ has seen/)
  })

  test('an update offered can be skipped as well as left for now', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/library?type=skill&show=update')
    const row = page.getByTestId('library-row').first()
    if (!(await row.count())) test.skip(true, 'no skill in the seeded organisation has an update offered')
    await row.getByRole('link').first().click()
    const card = page.getByTestId('asset-update')
    await expect(card.getByRole('button', { name: 'Not now' })).toBeVisible()
    await expect(card.getByRole('button', { name: /^Skip / })).toBeVisible()
  })

  test('a member reads the page but is offered no change', async ({ page }) => {
    await openRow(page, MEMBER)
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Roll back to this|Update to|^Skip / })).toHaveCount(0)
  })

  test('an address that is not an asset says so in words', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/library/not-an-asset')
    await expect(page.getByRole('alert')).toContainText("That isn't in the Library")
  })

  test("a copy's page shows the original under it, and the original's page says it is set aside and links back", async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/library?type=skill')
    const copy = page.getByTestId('library-row').filter({ hasText: 'Your copy of' })
    if (!(await copy.count())) test.skip(true, 'the seeded organisation has no copy in use in place of an original')
    await copy.first().getByRole('link').first().click()
    const original = page.getByTestId('asset-original')
    await expect(original).toContainText('Your copy of')
    await expect(page.getByTestId('asset-original-state')).toContainText('Set aside')
    await expect(original.getByRole('button', { name: 'Use the original again' })).toBeVisible()
    await original.getByRole('button', { name: 'View' }).click()
    await expect(original.getByTestId('asset-files')).toBeVisible()
    const copyAddress = page.url()
    await original.getByRole('link').first().click()
    await expect(page.getByTestId('asset-set-aside')).toContainText('Set aside')
    await page.getByTestId('asset-set-aside').getByRole('link').click()
    await expect(page).toHaveURL(copyAddress)
  })
})

