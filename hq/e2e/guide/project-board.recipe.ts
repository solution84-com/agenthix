import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:project-board — Website relaunch's Launch plan board opened in the Boards section.
test('project-board', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB?tool=boards',
    before: async (p) => {
      await p.getByRole('button', { name: 'Open Launch plan' }).click()
      await p.getByRole('button', { name: /^Hide .*'s menu$/ }).click()
    },
    ready: (p) => expect(p.getByText('Write the home page copy').last()).toBeVisible(),
  })
})
