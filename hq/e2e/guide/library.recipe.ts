import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:library — the Library, listing the ready-made agents, teams and task templates that come with hq.
test('library', async ({ page }) => {
  await capture(page, {
    path: '/library',
    ready: (p) => expect(p.getByTestId('library-card').first()).toBeVisible(),
  })
})
