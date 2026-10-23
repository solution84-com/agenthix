import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:agent-permissions — Writer's page under Organisation › Agents, with Permissions open to edit and the Safe preset picked.
// The preset only changes the draft in the editor; nothing is saved.
test('agent-permissions', async ({ page }) => {
  await capture(page, {
    path: '/admin/agents/writer',
    before: async (p) => {
      await p.getByRole('region', { name: 'Permissions', exact: true }).getByRole('button', { name: 'Edit' }).click()
      await p.getByRole('button', { name: 'Safe', exact: true }).click()
    },
    ready: (p) => expect(p.getByRole('group', { name: 'Approval', exact: true })).toBeVisible(),
  })
})
