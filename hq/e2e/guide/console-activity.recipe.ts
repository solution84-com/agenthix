import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'

// screenshot:console-activity — Activity: everything done in the Fleet Console and at the command line, and who did it.
test('console-activity', async ({ page }) => {
  await captureConsole(page, {
    path: '/activity',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Activity' })).toBeVisible()
      await expect(p.getByText('Sam Okafor').first()).toBeVisible()
    },
  })
})
