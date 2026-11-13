import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'
import { skipUnlessSeeded } from './fixtures/seeded'

/**
 * Files open in place, in the frame (seeing the work spec, part 2): the Files tool asks HQ to open a file, and the
 * renderer for its kind draws it from the relay. One of each kind: Markdown with a relative image and a sized image
 * tag, code, a table, an image and a PDF.
 *
 * The files are written by seed-e2e-files.mjs into the e2e administrator's own Files (E2E_FILES_FOLDER). It needs the
 * development relay running (scripts/dev/relay.sh), and for the PDF its viewer built and the files address
 * (files.localhost) reachable.
 */
const FOLDER = process.env.E2E_FILES_FOLDER

const openInFiles = (page: Page, path: string) =>
  page.goto(`/space?tool=files&file=${encodeURIComponent(`${FOLDER}/${path}`)}`)

/** A link the relay answers: the files address's ticket path, never HQ's API. */
const TICKET = /\/t\/[\w-]+\.[\w-]+\.[\w-]*$/

test.describe('a file opened in the Files tool @SC-1534', () => {
  skipUnlessSeeded(test, { E2E_FILES_FOLDER: FOLDER }, 'needs the seeded files: run seed-e2e-files.mjs and set E2E_FILES_FOLDER')

  test.beforeEach(async ({ page }) => { await signIn(page, ADMIN) })

  test('Markdown reads as a page, with a relative image and a sized image tag drawn through the relay', async ({ page }) => {
    await openInFiles(page, 'notes.md')
    await expect(page.getByRole('heading', { name: 'Seeing the work' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Read' })).toHaveAttribute('aria-selected', 'true')

    const chart = page.getByRole('img', { name: 'Q3 chart' })
    await expect(chart).toBeVisible()
    expect(await chart.getAttribute('src')).toMatch(TICKET)
    await expect.poll(() => chart.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(64)

    const sized = page.getByRole('img', { name: 'Q3 sized' })
    await expect(sized).toBeVisible()
    await expect(sized).toHaveAttribute('width', '120')
    expect(await sized.getAttribute('src')).toMatch(TICKET)

    expect(await page.getByRole('link', { name: 'Download' }).first().getAttribute('href')).toMatch(TICKET)
    await page.getByRole('tab', { name: 'Source' }).click()
    await expect(page.getByText('![Q3 chart](charts/q3.png)')).toBeVisible()
  })

  test('code is highlighted, with its language in the facts line', async ({ page }) => {
    await openInFiles(page, 'app.ts')
    await expect(page.getByText('TypeScript', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('export', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/greet/).first()).toBeVisible()
  })

  test('a CSV file is a table with its header and its rows, quoted commas kept', async ({ page }) => {
    await openInFiles(page, 'data.csv')
    const table = page.getByRole('table')
    await expect(table.getByRole('columnheader', { name: /region/ })).toBeVisible()
    await expect(table.getByRole('cell', { name: 'East, coast' })).toBeVisible()
    await expect(page.getByText(/3 rows/)).toBeVisible()
  })

  test('an image is drawn, with its pixel size in the facts line', async ({ page }) => {
    await openInFiles(page, 'charts/q3.png')
    await expect(page.getByRole('img', { name: 'q3.png' })).toBeVisible()
    await expect(page.getByText(/64 × 64/)).toBeVisible()
  })

  test('a PDF is drawn by the viewer on the files address, with its page count', async ({ page }) => {
    await openInFiles(page, 'report.pdf')
    const frame = page.locator('iframe[title="report.pdf"]')
    await expect(frame).toBeVisible()
    expect(new URL((await frame.getAttribute('src'))!).pathname).toBe('/viewer/pdf')
    await expect(page.getByRole('status').filter({ hasText: /PDF · .* · 1 page/ })).toBeVisible({ timeout: 20_000 })
  })
})
