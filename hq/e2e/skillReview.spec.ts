import { test, expect } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'

// Proposals waiting for review (skills spec part 5, board R1): the list by level, and the Overview's item. Written
// against the seeded e2e organisation, which holds no proposal; run by the lead against a running hq.

test.use({ viewport: { width: 1280, height: 800 } })

test('an administrator reads the proposals by the level they aim at @SC-1663', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/library/proposals')
  await expect(page.getByRole('heading', { level: 1, name: 'Waiting for review' })).toBeVisible()
  await expect(page.getByRole('region', { name: "The organisation's Library" })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Your space' })).toBeVisible()
})

test('a member sees only their own level @SC-1663', async ({ page }) => {
  await signIn(page, MEMBER)
  await page.goto('/library/proposals')
  await expect(page.getByRole('region', { name: 'Your space' })).toBeVisible()
  await expect(page.getByRole('region', { name: "The organisation's Library" })).toHaveCount(0)
})

test('a proposal that is not there, or not yours to see, says so @SC-1663', async ({ page }) => {
  await signIn(page, MEMBER)
  await page.goto('/library/proposals/00000000-0000-0000-0000-000000000000')
  await expect(page.getByRole('status').filter({ hasText: "isn't there" })).toBeVisible()
})

test('the Overview has no skill item when nothing waits @SC-1663', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/admin')
  await expect(page.getByRole('region', { name: 'Needs attention' })).toBeVisible()
  await expect(page.getByText(/skill proposals? waiting/)).toHaveCount(0)
})
