import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:agent-instructions — Kernel's page under Organisation › Agents, with Instructions open to edit.
test('agent-instructions', async ({ page }) => {
  await capture(page, {
    path: '/admin/agents/kernel',
    before: async (p) => {
      // The section is drawn before the agent's instructions have loaded, and Edit toggles: wait until the section and
      // its button are ready, then open the editor, and open it again only if it did not stay open.
      const section = p.getByRole('region', { name: 'Instructions', exact: true })
      const edit = section.getByRole('button', { name: 'Edit' })
      await expect(edit).toBeVisible()
      await expect(edit).toBeEnabled()
      await expect(async () => {
        if (await section.getByRole('button', { name: 'Done' }).count() === 0) await edit.click({ timeout: 5_000 })
        await expect(p.getByText('auto · read-only').first()).toBeVisible({ timeout: 5_000 })
      }).toPass({ timeout: 30_000 })
    },
    ready: (p) => expect(p.getByText('auto · read-only').first()).toBeVisible(),
  })
})
