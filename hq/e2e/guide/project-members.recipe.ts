import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:project-members — Website relaunch's Members section: its team, people and agents.
test('project-members', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=members',
    height: 1100,
    ready: async (p) => {
      await expect(p.getByText(/^Open project · \d+ members?$/)).toBeVisible()
      await expect(p.getByText('Priya Nair').first()).toBeVisible()
    },
  })
})
