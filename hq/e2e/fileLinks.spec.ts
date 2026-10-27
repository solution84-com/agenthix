import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'

/**
 * Stable links (seeing the work spec, part 3; V9): one link per file, the place's address with the tool and the file,
 * opening the file in place. Someone who can't see the place gets its usual "not found", never the file's name; a
 * file that's gone says so with its folder.
 *
 * Uses the files seed-e2e-files.mjs writes into the e2e administrator's own Files (E2E_FILES_FOLDER), and the
 * development relay (scripts/dev/relay.sh).
 */
const FOLDER = process.env.E2E_FILES_FOLDER

const fileLink = (path: string) => `/space?tool=files&file=${encodeURIComponent(`${FOLDER}/${path}`)}`

async function copiedLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Copy link' }).click()
  return page.evaluate(() => navigator.clipboard.readText())
}

test.describe('a file\'s stable link @SC-1537', () => {
  test.skip(!FOLDER, 'needs the seeded files: run seed-e2e-files.mjs and set E2E_FILES_FOLDER')
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('Copy link gives the place\'s address with the file, and the link opens the file in place', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto(fileLink('notes.md'))
    await expect(page.getByRole('heading', { name: 'Seeing the work' })).toBeVisible()
    const link = await copiedLink(page)
    expect(new URL(link).pathname).toBe('/space')
    expect(new URL(link).searchParams.get('file')).toBe(`${FOLDER}/notes.md`)
    expect(link).not.toMatch(/\/t\/|ticket|relay/)

    await page.goto('/space')
    await page.goto(link)
    await expect(page.getByRole('heading', { name: 'Seeing the work' })).toBeVisible()
  })

  test('a link to a file that is gone says so, with the folder it was in', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto(fileLink('no-such-file.md'))
    await expect(page.getByText(`This file isn't here any more. It was in Files › ${FOLDER}.`)).toBeVisible()
  })
})

test.describe('a link into a place someone can\'t see @SC-1538', () => {
  test('gets the place\'s usual "not found", never the file\'s name', async ({ page }) => {
    await signIn(page, MEMBER)
    await page.goto('/projects/E2ENOSUCH?tool=files&file=secret-plans%2Fq4-roadmap.md')
    await expect(page.getByText('Project not found')).toBeVisible()
    await expect(page.getByText('q4-roadmap.md')).toHaveCount(0)
  })
})
