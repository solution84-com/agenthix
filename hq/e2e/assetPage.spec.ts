import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'

// An asset's page (skills spec part 6; boards U3 and U5): the same for every kind, reached from a row of the Library.
// Written against the seeded e2e organisation; run by the lead against a running hq. Changes that need a second
// version (update, roll back, own copy) are proved by the lifecycle's integration tests; here the page shows the
// sections and asks before it does anything. A skill's page is its files, with About and who uses it in its header.

test.use({ viewport: { width: 1280, height: 800 } })

// `withMenu` opens the first row that has a ⋯ menu: a built-in skill has none, and which rows an HQ holds first varies.
async function openRow(page: Page, who = ADMIN, kind = 'skill', withMenu = false): Promise<void> {
  await signIn(page, who)
  await page.goto(`/library?type=${kind}`)
  await expect(page.getByTestId('library-card').first()).toBeVisible()
  const rows = page.getByTestId('library-card')
  const row = withMenu ? rows.filter({ has: page.getByRole('button', { name: /^More about (?!this answer)/ }) }).filter({ hasNotText: 'Built in' }).first() : rows.first()
  if (withMenu && !(await row.count())) test.skip(true, 'every skill in this organisation is built in: switched off in Settings, not removed')
  await row.getByRole('link').first().click()
  await expect(page.getByTestId('asset-page')).toBeVisible()
}

test.describe("an asset's page", () => {
  test("a skill's page is its files, with the version, About and who can edit in one header line @SC-1632", async ({ page }) => {
    await openRow(page)
    await expect(page).toHaveURL(/\/library\/[^/]+$/)
    await expect(page.getByTestId('asset-tree')).toBeVisible()
    await expect(page.getByTestId('version-crumb')).toContainText('in use')
    await page.getByRole('button', { name: 'About', exact: true }).click()
    await expect(page.getByTestId('asset-about')).toContainText('Identity')
    await expect(page.getByTestId('asset-about')).toContainText('Signed')
    await expect(page.getByTestId('asset-who')).toContainText('Administrators and Library maintainers')
  })

  test('its versions are in the breadcrumb, and choosing one shows it read-only @SC-1632', async ({ page }) => {
    await openRow(page)
    await page.getByRole('button', { name: /^Version: / }).click()
    await expect(page.getByTestId('skill-version').first()).toContainText('in use')
    const older = page.getByTestId('skill-version').nth(1)
    if (!(await older.count())) test.skip(true, 'this skill has one version')
    await older.click()
    await expect(page).toHaveURL(/\?version=/)
    await expect(page.getByTestId('older-version')).toContainText('read-only')
    await expect(page.getByRole('button', { name: 'Back to the version in use' })).toBeVisible()
  })

  test('an installed skill says who uses it in its header, and an administrator chooses @SC-1622', async ({ page }) => {
    await openRow(page)
    const usedBy = page.getByTestId('used-by')
    if (await usedBy.count()) {
      await expect(usedBy).toHaveAttribute('aria-label', /^Used by |^No agent uses it$|^Switched off$/)
      await usedBy.click()
      const holders = page.getByTestId('asset-holders')
      // A Library skill offers the choice; a built-in offers its one switch (an administrator's).
      await expect(holders.getByRole('button', { name: /instead$/ }).or(holders.getByRole('switch', { name: 'On for every agent' }))).toBeVisible()
    }
  })

  test("downloads are in the header's ⋯ on every skill, none in the file's header @SC-1632", async ({ page }) => {
    await openRow(page)
    await expect(page.getByTestId('asset-files').getByRole('button', { name: 'Download' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: /^More about (?!this answer)/ }).click()
    await expect(page.getByRole('menuitem', { name: /^Download .+The file shown/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /^Download the skill/ })).toBeVisible()
  })

  test('Remove names the agents that have it and asks first; Cancel leaves it in the Library @SC-1622', async ({ page }) => {
    await openRow(page, ADMIN, 'skill', true)
    await page.getByRole('button', { name: /^More about (?!this answer)/ }).click()
    await page.getByRole('menuitem', { name: /^Remove/ }).click()
    const dialog = page.getByRole('heading', { name: /^Remove / })
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('remove-reach')).toContainText(/(has|have) it\.|No agent has it\.|Every agent has it\./)
    await expect(page.getByText(/Its history is kept/)).toBeVisible()
    await page.getByTestId('remove-reach').locator('xpath=..').getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('asset-page')).toBeVisible()
  })

  test("a template's page says what it carries and what was made from it @SC-1637", async ({ page }) => {
    await openRow(page, ADMIN, 'agent', true)
    await expect(page.getByTestId('asset-carries')).toBeVisible()
    await expect(page.getByTestId('asset-made-from')).toContainText('Things made from a template are their own')
  })

  test("Remove on a template names what was made from it, says it stays as it is, and asks first @SC-1637", async ({ page }) => {
    await openRow(page, ADMIN, 'agent', true)
    await page.getByRole('button', { name: /^More about (?!this answer)/ }).click()
    await page.getByRole('menuitem', { name: /^Remove/ }).click()
    await expect(page.getByTestId('remove-reach')).toContainText(/Nothing has been made from it\.|made from it\. (It stays as it is|They stay as they are)\./)
    await expect(page.getByText(/an administrator can put it back/)).toBeVisible()
    await page.getByTestId('remove-reach').locator('xpath=..').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('asset-page')).toBeVisible()
  })

  test('About says when the skill was last used, or that HQ has not seen it used @SC-1660', async ({ page }) => {
    await openRow(page)
    await page.getByRole('button', { name: 'About', exact: true }).click()
    await expect(page.getByTestId('asset-about')).toContainText(/Last used|Not used yet that HQ has seen/)
  })

  test('an update offered can be skipped as well as left for now @SC-1621', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/library?type=skill&show=needs-you')
    const row = page.getByTestId('library-card').first()
    if (!(await row.count())) test.skip(true, 'no skill in the seeded organisation has an update offered')
    await row.getByRole('link').first().click()
    await page.getByTestId('asset-update-line').getByRole('button', { name: 'See what changes…' }).click()
    const card = page.getByTestId('asset-update')
    await expect(card.getByRole('button', { name: 'Not now' })).toBeVisible()
    await expect(card.getByRole('button', { name: /^Skip / })).toBeVisible()
  })

  test('a member reads the page but is offered no change @SC-1632', async ({ page }) => {
    await openRow(page, MEMBER)
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Return to this version|Update to|^Skip / })).toHaveCount(0)
  })

  test('an address that is not an asset says so in words @SC-1632', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/library/not-an-asset')
    await expect(page.getByRole('alert')).toContainText("That isn't in the Library")
  })

  test("a copy's page shows the original under it, and the original's page says it is set aside and links back @SC-1628", async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/library?type=skill')
    const copy = page.locator('[data-testid="library-card"][title*="Your copy of"]')
    if (!(await copy.count())) test.skip(true, 'the seeded organisation has no copy in use in place of an original')
    await copy.first().getByRole('link').first().click()
    await page.getByRole('button', { name: 'About', exact: true }).click()
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

