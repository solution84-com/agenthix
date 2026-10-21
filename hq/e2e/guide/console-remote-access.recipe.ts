import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'

// screenshot:console-remote-access — the Fleet Console's Remote access page, off because the organisation is not connected to Cloud.
test('console-remote-access', async ({ page }) => {
  await captureConsole(page, {
    path: '/remote-access',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Remote access' })).toBeVisible()
      await expect(p.getByText('Cannot be turned on yet')).toBeVisible()
    },
  })
})
