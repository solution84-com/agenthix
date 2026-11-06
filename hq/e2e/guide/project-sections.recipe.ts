import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:project-sections — Website relaunch opened on its Overview, with its sections down the left panel.
test('project-sections', async ({ page }) => {
  await capture(page, {
    path: '/projects/WEB',
    ready: async (p) => {
      await expect(p.getByTestId('place-overview')).toBeVisible()
      await expect(p.getByTestId('place-menu').getByRole('list', { name: /sections$/ }).getByRole('link', { name: /^Tasks/ })).toBeVisible()
    },
  })
})
