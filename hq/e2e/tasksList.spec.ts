import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

/**
 * A project's Tasks and Your tasks (T1–T4, Y1): the scorecards count the task state, Backlog first, plus Late and No
 * agent, and never a run state; the toolbar has Filter, Fields and Sort with Rank first; the Backlog card is the
 * planning view, whose lines can be ticked; on a phone a held touch ticks a line and the top bar becomes the
 * selection's. The project is any the e2e administrator may work in (E2E_PROJECT_KEY); nothing is changed.
 */
const PROJECT_KEY = process.env.E2E_PROJECT_KEY

test.describe("a project's Tasks", () => {
  test.skip(!PROJECT_KEY, 'needs a project: set E2E_PROJECT_KEY')

  test('counts by task state, never by run, and sorts by Rank', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await signIn(page, ADMIN)
    await page.goto(`/projects/${PROJECT_KEY}?tool=tasks`)
    const cards = page.getByRole('group', { name: 'Tasks by state' })
    await expect(cards.getByRole('button')).toHaveText([/^All/, /^Backlog/, /^To do/, /^In progress/, /^Done/, /^Late/, /^No agent/])
    await expect(cards.getByText(/Needs you|Running|Waiting|Not started/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Sort: Rank/ })).toBeVisible()
    await page.getByRole('button', { name: /Fields/ }).click()
    await expect(page.getByRole('menuitemcheckbox', { name: /Column/ })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    expect(errors).toEqual([])
  })

  test('the Backlog card is the planning view: lines can be ticked, and the bar acts on them', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto(`/projects/${PROJECT_KEY}?tool=tasks&view=backlog`)
    await page.waitForLoadState('networkidle')
    const boxes = page.getByRole('checkbox', { name: /^Select / })
    test.skip((await boxes.count()) === 0, 'needs a task in the Backlog')
    await boxes.first().click()
    const bar = page.getByRole('toolbar', { name: '1 selected' })
    await expect(bar.getByRole('button', { name: 'Move to To do' })).toBeVisible()
    await expect(bar.getByRole('button', { name: 'Add to sprint…' })).toBeDisabled()
    await bar.getByRole('button', { name: 'Clear the selection' }).click()
    await expect(bar).toHaveCount(0)
  })
})

test.describe("a project's Tasks on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test.skip(!PROJECT_KEY, 'needs a project: set E2E_PROJECT_KEY')

  test('a held touch ticks a line, and the top bar becomes ✕ · N selected · ⋯', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto(`/projects/${PROJECT_KEY}?tool=tasks&view=backlog`)
    await page.waitForLoadState('networkidle')
    const line = page.getByTestId('task-line').first()
    test.skip((await line.count()) === 0, 'needs a task in the Backlog')
    await line.dispatchEvent('pointerdown', { pointerType: 'touch' })
    await page.waitForTimeout(700)
    await line.dispatchEvent('pointerup', { pointerType: 'touch' })
    const top = page.getByTestId('mobile-header')
    await expect(top.getByText('1 selected')).toBeVisible()
    await expect(top.getByTestId('dock-phone-button')).toHaveCount(0)
    await top.getByRole('button', { name: 'Actions for the selection' }).click()
    await expect(page.getByRole('menuitem', { name: /Move to To do/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Archive 1 task/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await top.getByRole('button', { name: 'Cancel: leave selection' }).click()
    await expect(top.getByText('1 selected')).toHaveCount(0)
  })
})

test.describe('Your tasks', () => {
  test('is the person’s planned work by due date, with New task asking which project', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/tasks')
    const cards = page.getByRole('group', { name: 'Tasks by state' })
    await expect(cards.getByRole('button')).toHaveText([/^All/, /^Backlog/, /^To do/, /^In progress/, /^Done/, /^Late/])
    await expect(page.getByRole('button', { name: /Sort: Due date/ })).toBeVisible()
    await page.getByRole('button', { name: 'New task' }).click()
    await expect(page.getByRole('menu', { name: 'New task in' }).getByRole('menuitem', { name: 'Your space' })).toBeVisible()
  })
})
