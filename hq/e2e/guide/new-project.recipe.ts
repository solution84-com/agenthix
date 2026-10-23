import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:new-project — the New Project dialog for the organisation, filled in, with the billing profile the
// project's AI cost goes to (the sample has two). Sam is first asked whether it is just for them or for the organisation.
test('new-project', async ({ page }) => {
  await capture(page, {
    path: '/projects',
    before: async (p) => {
      await p.getByRole('button', { name: 'New project', exact: true }).click()
      await p.getByRole('button', { name: /For the organisation/ }).click()
      await p.getByPlaceholder('e.g. Website Redesign').fill('Client onboarding')
      await p.getByPlaceholder('Optional description').fill('Everything a new client needs in their first month.')
    },
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'New Project' })).toBeVisible()
      await expect(p.getByLabel('AI cost billed to')).toBeVisible()
    },
  })
})
