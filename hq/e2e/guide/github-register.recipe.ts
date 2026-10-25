import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:github-register — Manage organisation › Settings › GitHub before an App is registered: who will own it.
test('github-register', async ({ page }) => {
  await capture(page, {
    path: '/admin/settings/github',
    ready: (p) => expect(p.getByText('Who owns the App on GitHub')).toBeVisible(),
  })
})
