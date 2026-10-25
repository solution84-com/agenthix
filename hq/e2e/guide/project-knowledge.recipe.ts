import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:project-knowledge — Website relaunch's Knowledge tool: its sections beside the pages of one section.
// Needs the pages written by fixtures/guide-sample-knowledge.mjs (SITE_ROOT set when the sample is loaded).
test('project-knowledge', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=knowledge&section=decisions',
    ready: async (p) => {
      await expect(p.getByText('Build the site as static pages')).toBeVisible()
      await expect(p.getByText('One format for case studies')).toBeVisible()
    },
  })
})
