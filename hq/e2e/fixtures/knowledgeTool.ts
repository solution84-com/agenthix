import { expect, type Page } from '@playwright/test'

/**
 * Steps shared by the Knowledge specs: the tool is driven through its screens, never by writing files into storage.
 * Section and page names carry a per-run suffix, since the e2e suite runs against a database that keeps what it made.
 */

/** A lower-case suffix for names made in this run; a section name allows lower-case letters, digits and hyphens. */
export const runId = (): string => Math.random().toString(36).slice(2, 8)

export type PageFields = {
  title: string
  section: string
  description: string
  tags?: string[]
  properties?: Record<string, string>
  text: string
}

export const projectKnowledge = (key: string) => `/projects/${key}?tool=knowledge`
export const ORG_KNOWLEDGE = '/org/knowledge'

/** The sections tree, the one place a page is reached from. */
export const sectionsTree = (page: Page) => page.getByRole('navigation', { name: 'Sections' })

/** Opens a place's Knowledge at a plain address and waits until the tool has loaded its list. */
export async function openKnowledge(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole('button', { name: 'All pages' }).or(page.getByRole('button', { name: 'Needs fixing' })).first()).toBeVisible({ timeout: 20_000 })
}

/** Fills the editor (New page, or Edit with `section` left out) and saves; the page then reads. */
export async function fillAndSave(page: Page, fields: Partial<PageFields>, save = true): Promise<void> {
  if (fields.title !== undefined) await page.getByLabel('Title', { exact: true }).fill(fields.title)
  if (fields.section !== undefined) await page.getByLabel('Section', { exact: true }).fill(fields.section)
  if (fields.description !== undefined) await page.getByLabel('Description', { exact: true }).fill(fields.description)
  for (const tag of fields.tags ?? []) {
    const add = page.getByLabel('Add a tag')
    await add.fill(tag)
    await add.press('Enter')
  }
  for (const [name, value] of Object.entries(fields.properties ?? {})) {
    await page.getByRole('button', { name: 'Add property' }).click()
    await page.getByPlaceholder('name').last().fill(name)
    await page.getByPlaceholder('value').last().fill(value)
  }
  if (fields.text !== undefined) await page.locator('#knowledge-text').fill(fields.text)
  if (save) await page.getByRole('button', { name: 'Save', exact: true }).click()
}

/** New page from the section shown (or the top), filled and saved; ends on the page read. */
export async function newPage(page: Page, fields: PageFields): Promise<void> {
  await page.getByRole('button', { name: 'New page' }).first().click()
  await fillAndSave(page, fields)
  await expect(page.getByRole('heading', { name: fields.title })).toBeVisible({ timeout: 15_000 })
}

/** Opens a section from the tree, then one of its pages by its title. */
export async function openPage(page: Page, section: string, title: string): Promise<void> {
  await sectionsTree(page).getByRole('button', { name: new RegExp(`^${section}( |$)`) }).click()
  await page.getByRole('button', { name: new RegExp(`^${title}`) }).first().click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

/** The page's ⋯ menu entry (Move…, Download, Delete). */
export async function pageMenu(page: Page, item: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Back from a page to the section it was opened from: the header's back button is named after the section. */
export const backToList = (page: Page, section: string) => page.getByRole('button', { name: section }).first().click()
