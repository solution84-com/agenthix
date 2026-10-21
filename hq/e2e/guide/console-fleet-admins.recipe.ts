import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'

// screenshot:console-fleet-admins — the Fleet admins page: who holds the role, and how it is given or taken away.
test('console-fleet-admins', async ({ page }) => {
  await captureConsole(page, {
    path: '/fleet-admins',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Fleet admins' })).toBeVisible()
      await expect(p.getByRole('list', { name: 'Fleet admins' }).getByText('Sam Okafor')).toBeVisible()
    },
  })
})
