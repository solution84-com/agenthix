import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:project-workspaces — Website relaunch's Workspaces tool: one codebase with a repository, one without.
// Needs the workspaces added by fixtures/guide-sample-p.mjs.
test('project-workspaces', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=workspaces',
    ready: async (p) => {
      await expect(p.getByText('website-code')).toBeVisible()
      await expect(p.getByText('case-study-drafts')).toBeVisible()
    },
  })
})
