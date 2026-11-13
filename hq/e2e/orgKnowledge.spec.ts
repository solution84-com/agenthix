import { test, expect } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'
import { ORG_KNOWLEDGE, fillAndSave, newPage, openKnowledge, openPage, projectKnowledge, runId } from './fixtures/knowledgeTool'
import { skipUnlessSeeded } from './fixtures/seeded'

/**
 * Organisation knowledge (agent knowledge spec, screen U5; walkthrough section C): the organisation's own Knowledge,
 * which every member reads and only organisation admins change, and a project's search over this project, the
 * organisation or both, each result marked with where it is from.
 *
 * The project is made by seed-e2e-knowledge.mjs (E2E_KNOWLEDGE_PROJECT_KEY; the operator reads it as a Viewer).
 * Pages are written through the screens, in sections and with a search word made for this run.
 */
const KEY = process.env.E2E_KNOWLEDGE_PROJECT_KEY
const RUN = runId()
const ORG_SECTION = `how-we-work-${RUN}`
const PROJECT_SECTION = `e2e-org-${RUN}`
/** One word only these pages hold, so a search finds exactly them. */
const WORD = `reviewword${RUN}`

const ORG_PAGE = {
  title: 'Code review', section: ORG_SECTION, description: `How every change is reviewed before it merges, in every project (${WORD}).`,
  tags: ['review', 'process'], text: '## Every change\n\n- One reviewer who did not write it.\n- The reviewer runs it, not just reads it.',
}
const PROJECT_PAGE = {
  title: 'Release process', section: PROJECT_SECTION, description: `How this project cuts a release (${WORD}).`,
  text: `Merge, run the checks, tag.\n\nChanges are reviewed as in [code review](org:${ORG_SECTION}/code-review.md).`,
}

test.describe('organisation knowledge', () => {
  skipUnlessSeeded(test, { E2E_KNOWLEDGE_PROJECT_KEY: KEY }, 'needs a project the administrator changes: run seed-e2e-knowledge.mjs and set E2E_KNOWLEDGE_PROJECT_KEY')
  test.describe.configure({ mode: 'serial' })

  test('the organisation area has a Knowledge entry, and an admin writes a page there @SC-1417 @SC-1431', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/org')
    await page.getByRole('link', { name: /^Knowledge/ }).click()
    await expect(page).toHaveURL(/\/org\/knowledge/)
    await expect(page.getByText('Every member can read it')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New page' })).toBeVisible()
    await newPage(page, ORG_PAGE)
    await expect(page.getByText(ORG_PAGE.description)).toBeVisible()
  })

  test('a member reads the page and has nothing to change it with @SC-1417 @SC-1432', async ({ page }) => {
    await signIn(page, MEMBER)
    await openKnowledge(page, ORG_KNOWLEDGE)
    await expect(page.getByRole('button', { name: 'New page' })).toHaveCount(0)
    await openPage(page, ORG_SECTION, ORG_PAGE.title)
    await expect(page.getByText(ORG_PAGE.description)).toBeVisible()
    // In the page, not the docked conversation beside it, which has a Delete of its own.
    for (const name of ['Edit', 'Move…', 'Delete']) await expect(page.getByRole('main').getByRole('button', { name })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible()
  })

  test('an admin changes the page, and the member reads the new text @SC-1432', async ({ page }) => {
    await signIn(page, ADMIN)
    await openKnowledge(page, ORG_KNOWLEDGE)
    await openPage(page, ORG_SECTION, ORG_PAGE.title)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await fillAndSave(page, { text: '## Every change\n\n- Two reviewers for anything that touches security.' })
    await expect(page.getByText('Two reviewers for anything that touches security.')).toBeVisible()

    await signIn(page, MEMBER)
    await openKnowledge(page, ORG_KNOWLEDGE)
    await openPage(page, ORG_SECTION, ORG_PAGE.title)
    await expect(page.getByText('Two reviewers for anything that touches security.')).toBeVisible()
  })

  test("a project's search covers this project, the organisation or both, and each result says where it is from @SC-1426", async ({ page }) => {
    await signIn(page, ADMIN)
    await openKnowledge(page, projectKnowledge(KEY!))
    await page.getByRole('button', { name: 'New page' }).first().click()
    await fillAndSave(page, PROJECT_PAGE)
    await expect(page.getByRole('heading', { name: PROJECT_PAGE.title })).toBeVisible({ timeout: 15_000 })

    // A project's Viewer searches too: the results are the same, since both are theirs to read.
    for (const user of [ADMIN, MEMBER]) {
      await signIn(page, user)
      await openKnowledge(page, projectKnowledge(KEY!))
      await page.getByRole('searchbox', { name: 'Search knowledge' }).fill(WORD)
      const results = page.getByTestId('search-results')
      const marks = results.getByTestId('hit-from')

      // Both is the default: the page of each, marked.
      await expect(page.getByRole('radio', { name: 'Both' })).toHaveAttribute('aria-checked', 'true')
      await expect(results.getByRole('listitem').filter({ hasText: ORG_PAGE.title }).getByTestId('hit-from')).toHaveText('Organisation')
      await expect(results.getByRole('listitem').filter({ hasText: PROJECT_PAGE.title }).getByTestId('hit-from')).toHaveText('This project')

      await page.getByRole('radio', { name: 'This project' }).click()
      await expect(marks).toHaveText(['This project'])
      await expect(results).not.toContainText(ORG_PAGE.title)

      await page.getByRole('radio', { name: 'Organisation' }).click()
      await expect(marks).toHaveText(['Organisation'])
      await expect(results).not.toContainText(PROJECT_PAGE.title)
    }
  })

  test('an org: link in a project page opens that page in the organisation\'s Knowledge @SC-1429 @SC-1432', async ({ page }) => {
    await signIn(page, ADMIN)
    await openKnowledge(page, projectKnowledge(KEY!))
    await openPage(page, PROJECT_SECTION, PROJECT_PAGE.title)
    await page.getByRole('link', { name: 'code review' }).click()
    await expect(page).toHaveURL(/\/org\/knowledge/)
    await expect(page.getByRole('heading', { name: ORG_PAGE.title })).toBeVisible({ timeout: 10_000 })
  })
})
