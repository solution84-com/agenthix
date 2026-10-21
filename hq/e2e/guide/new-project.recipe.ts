import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:new-project — the New Project dialog, filled in.
test('new-project', async ({ page }) => {
  await capture(page, {
    path: '/projects',
    before: async (p) => {
      await p.getByRole('button', { name: 'New project', exact: true }).click()
      await p.getByPlaceholder('e.g. Website Redesign').fill('Client onboarding')
      await p.getByPlaceholder('Optional description').fill('Everything a new client needs in their first month.')
    },
    ready: (p) => expect(p.getByRole('heading', { name: 'New Project' })).toBeVisible(),
  })
})
