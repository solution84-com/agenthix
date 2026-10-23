import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:invite-dialog — the Invite someone dialog, filled in but not saved.
test('invite-dialog', async ({ page }) => {
  await capture(page, {
    path: '/admin/people',
    before: async (p) => {
      await p.getByRole('button', { name: 'Invite', exact: true }).click()
      await p.getByLabel("Who it's for").fill('Morgan Blake')
      await p.getByLabel('Add a project').selectOption({ label: 'Website relaunch (WEB)' })
    },
    ready: (p) => expect(p.getByText('Invite someone')).toBeVisible(),
  })
})
