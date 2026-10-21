import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:home — Sam's Home: the greeting, the message box, what needs them and what to say first.
test('home', async ({ page }) => {
  await capture(page, {
    path: '/',
    ready: (p) => expect(p.getByRole('button', { name: 'What can you do?' })).toBeVisible(),
  })
})
