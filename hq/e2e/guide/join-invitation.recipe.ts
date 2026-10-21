import { expect, test } from '@playwright/test'
import { capture, sample } from './capture'

// screenshot:join-invitation — the page an invited person opens: Sam's invitation for Robin Ellis to Customer research.
test('join-invitation', async ({ page }) => {
  await capture(page, {
    as: null,
    path: `/invite/${sample.invitation.token}`,
    before: async (p) => {
      await p.locator('#name').fill('Robin Ellis')
      await p.locator('#username').fill('robin')
    },
    ready: (p) => expect(p.getByRole('heading', { name: /^Join / })).toBeVisible(),
  })
})
