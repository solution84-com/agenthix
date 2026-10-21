import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:library — the Library's Agents tab, with the ready-made agents that come with hq.
test('library', async ({ page }) => {
  await capture(page, {
    path: '/library',
    ready: (p) => expect(p.getByTestId('library-row').first()).toBeVisible(),
  })
})
