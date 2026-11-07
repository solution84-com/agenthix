import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:project-members — Website relaunch's Members section: its people, agents and team in one list.
test('project-members', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=members',
    height: 1100,
    ready: async (p) => {
      await expect(p.getByText(/^\d+ (person|people) · /).first()).toBeVisible()
      await expect(p.getByText('Priya Nair').first()).toBeVisible()
    },
  })
})
