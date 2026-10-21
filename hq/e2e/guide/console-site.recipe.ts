import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'
import { OFFICE_SERVER } from './consoleSample'

// screenshot:console-site — a site's page in the Fleet Console: its runs, version and backups, then its machine,
// with Plan maintenance, Notify and Disconnect at the top.
test('console-site', async ({ page }) => {
  await captureConsole(page, {
    path: `/sites/${OFFICE_SERVER}`,
    height: 1100,
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'office-server' })).toBeVisible()
      await expect(p.getByRole('button', { name: 'Disconnect…' })).toBeVisible()
      await expect(p.getByText('The machine', { exact: true })).toBeVisible()
    },
  })
})
