import { test, expect } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'

// The agent's Skills (skills spec part 6, board A1). Written against the seeded e2e organisation; run by the lead
// against a running hq.

test.use({ viewport: { width: 1280, height: 800 } })

test.describe('an agent\'s Skills, for an administrator', () => {
  test('shows everything the agent will see, in the clash order, with what the list costs', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/admin/agents')
    await page.getByRole('link', { name: 'Manage', exact: true }).first().click()
    const skills = page.getByRole('region', { name: 'Skills' })
    await expect(skills).toBeVisible()
    await expect(skills.getByTestId('agent-skills-cost')).toContainText('tokens per request')
    const headings = await skills.getByRole('heading', { level: 4 }).allTextContents()
    expect(headings.slice(0, 2)).toEqual(['Built in', 'Every agent has these'])
    await expect(skills.getByRole('button', { name: 'Add a skill' })).toBeVisible()
  })

  test('opens a picker over the Library\'s skills, with a way to add one that is not there yet', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/admin/agents')
    await page.getByRole('link', { name: 'Manage', exact: true }).first().click()
    await page.getByRole('button', { name: 'Add a skill' }).click()
    await expect(page.getByTestId('add-skill-picker')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Add it to the Library' })).toHaveAttribute('href', '/library/add')
  })
})

test.describe('an agent\'s Skills, for a member', () => {
  test('reads what the agent can do, and changes nothing', async ({ page }) => {
    await signIn(page, MEMBER)
    await page.goto('/agents')
    await page.getByRole('link').filter({ hasText: /@/ }).first().click()
    await page.getByRole('link', { name: /Skills/ }).first().click()
    await expect(page.getByText('Read only.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add a skill' })).toHaveCount(0)
  })
})
