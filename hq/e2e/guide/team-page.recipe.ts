import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:team-page — the Studio team: its people and agent, and the project it works in.
test('team-page', async ({ page }) => {
  await capture(page, {
    path: '/org/teams',
    before: (p) => p.getByRole('link', { name: /Studio/ }).click(),
    ready: async (p) => {
      await expect(p.getByRole('button', { name: 'Add to a project' })).toBeVisible()
      await expect(p.getByText('Priya Nair').first()).toBeVisible()
    },
  })
})
