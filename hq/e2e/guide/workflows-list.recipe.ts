import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:workflows-list — Website relaunch's Workflows tool before any workflow has been proposed.
test('workflows-list', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=workflows',
    ready: (p) => expect(p.getByText('No workflows yet')).toBeVisible(),
  })
})
