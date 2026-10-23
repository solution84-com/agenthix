import { expect, test } from '@playwright/test'
import { capture } from './capture'
import { addProvider } from '../fixtures/voiceProviders'

// screenshot:setup-ai-voice — setup's Voice step: one speech to text and one text to speech provider to add, each
// with its vendor to choose. As in setup-ai-model nothing is saved through the form; both providers are put in the
// database afterwards.
test('setup-ai-voice', async ({ page }) => {
  await capture(page, {
    path: '/setup?step=voice&path=keys',
    ready: async (p) => {
      await expect(p.getByRole('heading', { name: 'Voice' })).toBeVisible()
      await expect(p.getByRole('button', { name: /^AssemblyAI/ })).toBeVisible()
      await expect(p.getByRole('button', { name: /^Inworld/ })).toBeVisible()
    },
  })
  addProvider('assemblyai')
  addProvider('inworld')
})
