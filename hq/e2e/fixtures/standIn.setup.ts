import { test as setup } from '@playwright/test'
import { STAND_IN_KEY, STAND_IN_MODEL, STAND_IN_URL, adminOperations, writeRecord } from './standInModel'

type Provider = { id: string; vendor: string }
type Choice = { providerId: string; model: string } | null

// The organisation talks on the stand-in for the run: it is added as an own endpoint on Providers and made the
// default conversation and worker model. An organisation that already has its own endpoint is left as it is, and so
// is one the e2e admin cannot sign in to (the specs that sign in fail on their own).
setup('the organisation talks on the stand-in model', async ({ request }) => {
  const call = await adminOperations(request)
  if (!call) return
  const providers = (await call('get-ai-providers', undefined)) as Provider[]
  if (providers.some((p) => p.vendor === 'openai_compatible')) return
  const before = (await call('get-models-settings', undefined)) as { conversation: Choice; worker: Choice }
  const { provider } = (await call('add-ai-provider', {
    vendor: 'openai_compatible', name: 'Stand-in', key: STAND_IN_KEY, baseUrl: STAND_IN_URL,
  })) as { provider: Provider }
  const choice = `${provider.id}/${STAND_IN_MODEL}`
  await call('set-model-defaults', { conversation: choice, worker: choice })
  const valueOf = (c: Choice) => (c ? `${c.providerId}/${c.model}` : null)
  writeRecord({ providerId: provider.id, conversation: valueOf(before.conversation), worker: valueOf(before.worker) })
})
