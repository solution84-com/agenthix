import { expect, test } from '@playwright/test'
import { capture } from './capture'
import { PLACES, conversationShown, openLivePreview } from './livePreviewSample'

// screenshot:live-preview-start — Live preview chosen on a branch with none running: where it would start and how
// full that site is, the Site choice and Start live preview. Drawn from livePreviewSample.ts.
test('live-preview-start', async ({ page }) => {
  await capture(page, {
    path: '/chat',
    before: (p) => openLivePreview(p, { places: PLACES }),
    ready: async (p) => {
      await expect(p.getByTestId('live-preview-start')).toContainText('Runs on office-server · 2 of 6 open.')
      await expect(p.getByRole('button', { name: /Start live preview/ })).toBeVisible()
      await conversationShown(p)
    },
  })
})
