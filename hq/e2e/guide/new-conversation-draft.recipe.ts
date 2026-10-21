import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:new-conversation-draft — a new conversation in the dock: the list of places, the project already chosen, and Cancel.
test('new-conversation-draft', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=tasks',
    before: (p) => p.getByRole('button', { name: /^Talk about/ }).click(),
    ready: async (p) => {
      await expect(p.getByTestId('dock-draft')).toBeVisible()
      await expect(p.getByRole('combobox', { name: 'Find a place' })).toBeVisible()
      await expect(p.getByRole('button', { name: 'Cancel' })).toBeVisible()
    },
  })
})
