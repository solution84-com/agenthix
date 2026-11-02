import { expect, test } from '@playwright/test'
import { capture } from './capture'
import { APP_ADDRESS, PLACES, RUNNING, conversationShown, openLivePreview } from './livePreviewSample'

// screenshot:live-preview — website-code's about-page-intro branch with its live preview running: the bar, the app in
// the middle, the strip on the left and Writer's conversation on the right. Drawn from livePreviewSample.ts.
test('live-preview', async ({ page }) => {
  await capture(page, {
    path: '/chat',
    before: (p) => openLivePreview(p, { places: PLACES, view: RUNNING }),
    ready: async (p) => {
      await expect(p.getByTestId('live-preview-bar')).toContainText('Running')
      await expect(p.getByTestId('live-preview-address')).toHaveText(APP_ADDRESS)
      await expect(p.frameLocator('[data-testid="live-app-frame"]').getByRole('heading', { name: 'About us' })).toBeVisible()
      await conversationShown(p)
    },
  })
})
