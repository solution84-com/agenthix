import { expect, test } from '@playwright/test'
import type { LivePreviewView } from '../../src/livePreviews/types'
import { capture } from './capture'
import { PLACES, conversationShown, RUNNING, openLivePreview } from './livePreviewSample'

const postgres = {
  name: 'postgres', image: 'postgres:16', command: null, environment: [['POSTGRES_PASSWORD', 'website']] as [string, string][],
  expose: [5432], healthcheck: null, dependsOn: [], volume: null,
}

// The questions are HQ's own sentences, as hq/src/livePreviews/questions.ts and core's installScriptQuestion word them.
const ASKING: LivePreviewView = {
  ...RUNNING,
  services: [{ name: 'postgres', state: 'waiting', declarationHash: 'd'.repeat(64), declaration: postgres, detail: null }],
  questions: [
    {
      kind: 'service.start', service: 'postgres', declaration: 'd'.repeat(64), image: 'postgres:16',
      question: 'The app wants to run the service postgres (postgres:16) beside it, as .agents/services.yaml declares. Start it?',
    },
    {
      kind: 'package.use', ecosystem: 'npm', name: 'image-squeeze', version: '2.0.1',
      question: 'image-squeeze is 2 days old, has 140 downloads a week and runs code when installed. I recommend not using it.',
    },
  ],
}

// screenshot:live-preview-question — the strip of a running live preview asking for a yes: a new service, with Start
// it, and a blocked install script, with Allow. Drawn from livePreviewSample.ts.
test('live-preview-question', async ({ page }) => {
  await capture(page, {
    path: '/chat',
    before: (p) => openLivePreview(p, { places: PLACES, view: ASKING }),
    ready: async (p) => {
      const asking = p.getByRole('region', { name: 'Waiting for your yes' })
      await expect(asking.getByRole('button', { name: 'Start it' })).toBeVisible()
      await expect(asking.getByRole('button', { name: 'Allow' })).toBeVisible()
      await expect(p.frameLocator('[data-testid="live-app-frame"]').getByRole('heading', { name: 'About us' })).toBeVisible()
      await conversationShown(p)
    },
  })
})
