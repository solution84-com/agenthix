import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:new-project — New project for the organisation, filled in. Sam is an organisation admin and the sample has
// two billing profiles, so the form also asks which one the project's AI cost goes to.
test('new-project', async ({ page }) => {
  await capture(page, {
    path: '/projects',
    before: async (p) => {
      await p.getByRole('button', { name: 'New project', exact: true }).click()
      await p.getByLabel('Name', { exact: true }).fill('Client onboarding')
      await p.getByLabel('Description (optional)').fill('Everything a new client needs in their first month.')
      await p.getByLabel(/The organisation/).check()
    },
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'New project' })).toBeVisible()
      await expect(p.getByLabel('AI cost billed to')).toBeVisible()
    },
  })
})
