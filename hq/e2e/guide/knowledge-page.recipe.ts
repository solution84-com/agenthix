import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:knowledge-page — one knowledge page open: its properties, text and On this page.
// Needs the pages written by fixtures/guide-sample-knowledge.mjs (SITE_ROOT set when the sample is loaded).
test('knowledge-page', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=knowledge&page=decisions/0001-static-site.md',
    ready: async (p) => {
      await expect(p.getByText('Static pages are cheaper to host')).toBeVisible()
      await expect(p.getByText('On this page').first()).toBeVisible()
    },
  })
})
