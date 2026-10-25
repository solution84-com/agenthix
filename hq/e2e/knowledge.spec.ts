import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'
import {
  backToList, fillAndSave, newPage, openKnowledge, openPage, pageMenu, projectKnowledge, runId, sectionsTree,
} from './fixtures/knowledgeTool'

/**
 * The Knowledge tool (agent knowledge spec, screens U2 to U4; walkthrough sections A and B): sections and pages that
 * people browse, write, move, delete and restore, and a person who may only read sees no change controls.
 *
 * The project is made by seed-e2e-knowledge.mjs (E2E_KNOWLEDGE_PROJECT_KEY): the e2e administrator changes its
 * knowledge, the e2e operator is a Viewer of it. Every page is written through the screens, in sections named for
 * this run, so a second run on the same database finds nothing of the first. The tests run in order on one set of
 * pages. Names and layout come from the screens; the knowledge tool is measured wide (a desktop window).
 */
const KEY = process.env.E2E_KNOWLEDGE_PROJECT_KEY
const RUN = runId()
const SECTION = `e2e-${RUN}`
const DECISIONS = `e2e-${RUN}-decisions`
const MOVED = `e2e-${RUN}-moved`

const RELEASE = {
  title: 'Release process', section: SECTION,
  description: 'How we cut and publish a release, and who approves a staging deploy.',
  tags: ['releases', 'deploys'], properties: { status: 'draft', owner: 'Mia' },
  text: [
    '## Cutting a release', '', '1. Merge everything for the release into `main`.', '2. Run the checks; they must pass.', '',
    '## Staging deploys', '', 'Staging deploys go out after the checks pass.', '',
    '## Production deploys', '', 'Production deploys go out on Tuesdays, after a day on staging.', '',
    'See also [Onboarding a client](onboarding-a-client.md).',
  ].join('\n'),
}
const ONBOARDING = {
  title: 'Onboarding a client', section: SECTION, description: 'What we set up in the first week with a new client.',
  tags: ['clients'], properties: { status: 'approved' },
  text: '## The first week\n\n- A shared channel, named after the client.\n\nNotes go in [the release process](release-process.md) if they change it.',
}

test.describe('the Knowledge tool', () => {
  test.skip(!KEY, 'needs a project the administrator changes: run seed-e2e-knowledge.mjs and set E2E_KNOWLEDGE_PROJECT_KEY')
  test.describe.configure({ mode: 'serial' })

  const asAdmin = async (page: Page) => {
    await signIn(page, ADMIN)
    await openKnowledge(page, projectKnowledge(KEY!))
  }

  test('a page is written with title, description, tags and properties, and reads like a guide page @SC-1429 @SC-1430', async ({ page }) => {
    await asAdmin(page)
    await newPage(page, RELEASE)
    await expect(page.getByText(RELEASE.description)).toBeVisible()
    for (const tag of RELEASE.tags) await expect(page.getByText(tag, { exact: true }).first()).toBeVisible()
    // A property is one chip: its name, then its value.
    await expect(page.getByText('status draft', { exact: true })).toBeVisible()
    await expect(page.getByText('owner Mia', { exact: true })).toBeVisible()
    const outline = page.getByRole('navigation', { name: 'On this page' })
    for (const heading of ['Cutting a release', 'Staging deploys', 'Production deploys']) await expect(outline.getByRole('button', { name: heading })).toBeVisible()
    // The page it links to does not exist yet: the link is a problem on the page, not a dead end.
    await expect(page.getByRole('alert').first()).toBeVisible()
  })

  test('a save the gate refuses shows its problem on the field and writes nothing @SC-1420 @SC-1430', async ({ page }) => {
    await asAdmin(page)
    await openPage(page, SECTION, RELEASE.title)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await fillAndSave(page, { description: '' })
    await expect(page.getByRole('alert').filter({ hasText: /description/i })).toBeVisible()
    await fillAndSave(page, { description: RELEASE.description, tags: ['Releases'] })
    await expect(page.getByRole('alert').filter({ hasText: /lower-case/i })).toBeVisible()
    await page.getByTestId('place-canvas').getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.getByRole('list', { name: 'Versions' }).getByRole('listitem')).toHaveCount(1)
  })

  test('a second page links back, and Linked from lists the pages that link to a page @SC-1429', async ({ page }) => {
    await asAdmin(page)
    await sectionsTree(page).getByRole('button', { name: new RegExp(`^${SECTION}( |$)`) }).click()
    await newPage(page, ONBOARDING)
    await expect(page.getByRole('region', { name: 'Linked from' }).getByRole('button', { name: RELEASE.title })).toBeVisible()
    // The link that was broken now opens the page.
    await backToList(page, SECTION)
    await page.getByRole('button', { name: new RegExp(`^${RELEASE.title}`) }).first().click()
    await page.getByRole('link', { name: 'Onboarding a client' }).click()
    await expect(page.getByRole('heading', { name: ONBOARDING.title })).toBeVisible()
  })

  test('a section lists its pages with their facts, and a property filter narrows them @SC-1428', async ({ page }) => {
    await asAdmin(page)
    await sectionsTree(page).getByRole('button', { name: new RegExp(`^${SECTION}( |$)`) }).click()
    await expect(page.getByRole('heading', { name: SECTION, level: 3 })).toBeVisible()
    const release = page.getByRole('button', { name: new RegExp(`^${RELEASE.title}`) })
    const onboarding = page.getByRole('button', { name: new RegExp(`^${ONBOARDING.title}`) })
    await expect(release).toContainText(RELEASE.description)
    await expect(release).toContainText('draft')
    await expect(release).toContainText('releases')
    await expect(onboarding).toBeVisible()

    // One filter for each property the pages use; nothing about "status" is built in.
    await page.getByRole('combobox', { name: 'status' }).selectOption('draft')
    await expect(release).toBeVisible()
    await expect(onboarding).toHaveCount(0)
    await page.getByRole('combobox', { name: 'status' }).selectOption('')
    await page.getByRole('combobox', { name: 'Tag' }).selectOption('clients')
    await expect(onboarding).toBeVisible()
    await expect(release).toHaveCount(0)
    await page.getByRole('combobox', { name: 'Tag' }).selectOption('')

    await page.getByRole('button', { name: /^All pages/ }).click()
    await expect(page.getByRole('button', { name: new RegExp(`^${RELEASE.title}`) }).first()).toBeVisible()
  })

  test('a new section holds its first page, and its own properties are listed with it @SC-1428 @SC-1430', async ({ page }) => {
    await asAdmin(page)
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'New section' }).click()
    await page.getByLabel(/^Section name/).fill(DECISIONS)
    await page.getByRole('button', { name: 'Write its first page' }).click()
    await fillAndSave(page, {
      title: 'Search with ripgrep', description: "We search knowledge with ripgrep, the program Claude Code's Grep runs.",
      tags: ['search'], properties: { status: 'accepted', date: '2026-10-25' },
      text: "Chosen over a regex library because its engine never backtracks.",
    })
    await expect(page.getByRole('heading', { name: 'Search with ripgrep' })).toBeVisible({ timeout: 15_000 })
    await backToList(page, DECISIONS)
    await expect(sectionsTree(page).getByRole('button', { name: new RegExp(`^${SECTION}( |$)`) })).toBeVisible()
    await expect(sectionsTree(page).getByRole('button', { name: new RegExp(`^${DECISIONS}`) })).toBeVisible()
    await sectionsTree(page).getByRole('button', { name: new RegExp(`^${DECISIONS}`) }).click()
    await expect(page.getByRole('heading', { name: DECISIONS, level: 3 })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Search with ripgrep/ })).toContainText('2026-10-25')
  })

  test('Needs fixing gathers a page with a problem, which shows it in place of its description @SC-1428', async ({ page }) => {
    await asAdmin(page)
    await sectionsTree(page).getByRole('button', { name: new RegExp(`^${SECTION}( |$)`) }).click()
    const description = 'A page whose link leads nowhere.'
    await newPage(page, { title: 'Broken links', section: SECTION, description, text: 'See [a page that is not there](no-such-page.md).' })
    await backToList(page, SECTION)
    await page.getByRole('button', { name: /^Needs fixing/ }).click()
    const row = page.getByRole('button', { name: /^Broken links/ })
    await expect(row).toBeVisible()
    await expect(row).not.toContainText(description)
    await expect(page.getByRole('button', { name: new RegExp(`^${ONBOARDING.title}`) })).toHaveCount(0)
  })

  test('History shows each version and its change, and Restore this version saves the older text as a new one @SC-1425', async ({ page }) => {
    await asAdmin(page)
    await openPage(page, SECTION, RELEASE.title)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.locator('#knowledge-text').fill(RELEASE.text.replace('after the checks pass.', 'after the checks pass and a review.'))
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('and a review.')).toBeVisible()

    await page.getByRole('button', { name: 'History' }).click()
    const versions = page.getByRole('list', { name: 'Versions' }).getByRole('listitem')
    await expect(versions).toHaveCount(2)
    // The newer version shows the changed line.
    await expect(page.getByRole('region', { name: 'Changes in this version' })).toContainText('and a review.')

    await versions.nth(1).getByRole('button').click()
    await page.getByRole('button', { name: 'Restore this version' }).click()
    await expect(versions).toHaveCount(3)
  })

  test('Move takes a page to another section and leaves it readable there @SC-1422', async ({ page }) => {
    await asAdmin(page)
    await openPage(page, DECISIONS, 'Search with ripgrep')
    await pageMenu(page, /^Move/)
    await page.getByLabel('To another section').fill(MOVED)
    await page.getByRole('button', { name: 'Move', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`page=${MOVED}%2Fsearch-with-ripgrep\\.md`))
    await expect(page.getByRole('heading', { name: 'Search with ripgrep' })).toBeVisible()
    await backToList(page, MOVED)
    await expect(sectionsTree(page).getByRole('button', { name: new RegExp(`^${MOVED}`) })).toBeVisible()
  })

  test('two people editing one page: the second save is refused with the current text, and keeps what they wrote @SC-1421', async ({ page, context }) => {
    await asAdmin(page)
    await openPage(page, SECTION, ONBOARDING.title)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()

    const other = await context.newPage()
    await openKnowledge(other, projectKnowledge(KEY!))
    await openPage(other, SECTION, ONBOARDING.title)
    await other.getByRole('button', { name: 'Edit', exact: true }).click()
    await other.locator('#knowledge-text').fill('## The first week\n\nTheir change, saved first.')
    await other.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(other.getByText('Their change, saved first.')).toBeVisible()
    await other.close()

    await page.locator('#knowledge-text').fill('## The first week\n\nMy change, saved second.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Changed while you were editing.' })).toBeVisible()
    await expect(page.locator('#knowledge-text')).toHaveValue(/My change, saved second\./)
    await page.getByRole('button', { name: 'See their change' }).click()
    await expect(page.getByLabel('Their version')).toContainText('Their change, saved first.')
    await page.getByRole('button', { name: 'Save mine over it' }).click()
    await expect(page.getByText('My change, saved second.')).toBeVisible()
  })

  test('Delete leaves the page at once; Recently deleted restores it, and Delete permanently removes another for good @SC-1423 @SC-1424', async ({ page }) => {
    await asAdmin(page)
    await sectionsTree(page).getByRole('button', { name: new RegExp(`^${SECTION}( |$)`) }).click()
    await newPage(page, { title: 'Delete me', section: SECTION, description: 'A page to delete.', text: 'Gone soon.' })

    await pageMenu(page, /^Delete$/)
    await page.getByRole('button', { name: 'Delete page' }).click()
    // It is not a wait: the tool goes back to the section, with where the page went.
    const notice = page.getByRole('status').filter({ hasText: 'Deleted Delete me' })
    await expect(notice).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('button', { name: /^Delete me/ })).toHaveCount(0)

    await notice.getByRole('button', { name: 'Recently deleted' }).click()
    const row = page.getByTestId('deleted-row').filter({ hasText: `${SECTION}/delete-me.md` })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(row).toHaveCount(0)
    await sectionsTree(page).getByRole('button', { name: new RegExp(`^${SECTION}( |$)`) }).click()
    await expect(page.getByRole('button', { name: /^Delete me/ })).toBeVisible()

    // A page deleted and then removed for good.
    await page.getByRole('button', { name: /^Delete me/ }).click()
    await pageMenu(page, /^Delete$/)
    await page.getByRole('button', { name: 'Delete page' }).click()
    await page.getByRole('status').filter({ hasText: 'Deleted Delete me' }).getByRole('button', { name: 'Recently deleted' }).click()
    const again = page.getByTestId('deleted-row').filter({ hasText: `${SECTION}/delete-me.md` })
    await again.getByRole('button', { name: 'Delete permanently' }).click()
    await page.getByTestId('confirm-for-good').getByRole('button', { name: 'Delete permanently' }).click()
    await expect(again).toHaveCount(0)
  })

  test('a Viewer reads the pages and has no controls to change them @SC-1417 @SC-1429', async ({ page }) => {
    await signIn(page, MEMBER)
    await openKnowledge(page, projectKnowledge(KEY!))
    await expect(page.getByRole('button', { name: 'New page' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'More actions' })).toHaveCount(0)
    await openPage(page, SECTION, RELEASE.title)
    for (const name of ['Mention', 'History']) await expect(page.getByRole('button', { name })).toBeVisible()
    // In the page, not the docked conversation beside it, which has a Delete of its own.
    for (const name of ['Edit', 'Move…', 'Delete']) await expect(page.getByRole('main').getByRole('button', { name })).toHaveCount(0)
    // The menu holds Download alone: no Move, no Delete.
    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Download' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Move|Delete/ })).toHaveCount(0)
    // History is for reading: with no right to change, no Restore.
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.getByRole('button', { name: 'Restore this version' })).toHaveCount(0)
  })
})
