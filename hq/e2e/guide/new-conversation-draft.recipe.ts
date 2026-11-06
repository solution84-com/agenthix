import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:new-conversation-draft — a new conversation over the open one: the list of places, the project already chosen.
test('new-conversation-draft', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=tasks',
    before: (p) => p.getByRole('button', { name: /^Talk about/ }).click(),
    ready: async (p) => {
      const draft = p.getByRole('dialog', { name: 'New conversation' }).or(p.getByTestId('dock-draft'))
      await expect(draft).toBeVisible()
      await expect(draft.getByRole('combobox', { name: 'Find a place' })).toBeVisible()
    },
  })
})
