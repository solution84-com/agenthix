import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:billing-profiles — Manage organisation › Billing profiles: the default profile, named after the
// organisation, and one for client work, each with its projects and this month's cost.
test('billing-profiles', async ({ page }) => {
  await capture(page, {
    path: '/admin/billing-profiles',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Billing profiles', exact: true })).toBeVisible()
      const list = p.getByRole('list', { name: 'Billing profiles' })
      await expect(list.getByText('Client reports')).toBeVisible()
      await expect(list.getByText('Default', { exact: true })).toBeVisible()
      await expect(list.getByText(/^This month: \$/).first()).toBeVisible()
    },
  })
})
