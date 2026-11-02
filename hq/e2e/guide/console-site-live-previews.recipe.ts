import { expect, test } from '@playwright/test'
import { captureConsole } from './consoleCapture'
import { OFFICE_SERVER } from './consoleSample'

// screenshot:console-site-live-previews — office-server's page in the Fleet Console, at its Live previews: on, six at once
// and stopped after two hours unused, its capacity, and the two live previews open with Stop.
test('console-site-live-previews', async ({ page }) => {
  await captureConsole(page, {
    path: `/sites/${OFFICE_SERVER}`,
    ready: async (p) => {
      const open = p.getByRole('list', { name: 'Live previews open' })
      await expect(open.getByRole('listitem')).toHaveCount(2)
      await p.getByText('Live previews on this site', { exact: true }).evaluate((el) => el.closest('section')?.scrollIntoView({ block: 'start' }) ?? el.scrollIntoView({ block: 'start' }))
    },
  })
})
