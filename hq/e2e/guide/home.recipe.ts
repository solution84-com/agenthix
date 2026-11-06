import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:home — Sam's Home: the greeting, what needs them, what is running and what to say first.
test('home', async ({ page }) => {
  await capture(page, {
    path: '/',
    ready: (p) => expect(p.getByRole('button', { name: 'What can you do?' })).toBeVisible(),
  })
})
