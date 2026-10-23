import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:new-agent — the New Agent dialog under Organisation › Agents, filled in and not saved.
test('new-agent', async ({ page }) => {
  await capture(page, {
    path: '/admin/agents',
    before: async (p) => {
      await p.getByRole('button', { name: 'New agent', exact: true }).click()
      await p.getByPlaceholder('My Assistant').fill('Editor')
      await p.getByPlaceholder('e.g. Software Engineer').fill('Checks tone and style')
    },
    ready: (p) => expect(p.getByText('Define a name, handle, and model')).toBeVisible(),
  })
})
