import { test as setup } from '@playwright/test'
import { STAND_IN_KEY, STAND_IN_MODEL, STAND_IN_URL, adminOperations, writeRecord, type AgentChoices } from './standInModel'

type Provider = { id: string; vendor: string; name: string; baseUrl: string | null }
type Choice = { providerId: string; model: string } | null

const STAND_IN_NAME = 'Stand-in'

// The organisation talks on the stand-in for the run: it is added as an own endpoint on Providers and made the
// default conversation and worker model. An organisation that already has its own endpoint is left as it is, and so
// is one the e2e admin cannot sign in to (the specs that sign in fail on their own). A stand-in an earlier run left
// behind, at a port no longer served, is removed first. An agent with models of its own talks on the stand-in for the
// run as well, or a spec that talks to it would reach a real model.
setup('the organisation talks on the stand-in model', async ({ request }) => {
  const call = await adminOperations(request)
  if (!call) return
  const valueOf = (c: Choice) => (c ? `${c.providerId}/${c.model}` : null)
  for (const left of (await call('get-ai-providers', undefined)) as Provider[]) {
    if (left.vendor === 'openai_compatible' && left.name === STAND_IN_NAME && left.baseUrl !== STAND_IN_URL) {
      await call('remove-ai-provider', { id: left.id })
    }
  }
  const providers = (await call('get-ai-providers', undefined)) as Provider[]
  if (providers.some((p) => p.vendor === 'openai_compatible')) return
  const before = (await call('get-models-settings', undefined)) as { conversation: Choice; worker: Choice }
  const { provider } = (await call('add-ai-provider', {
    vendor: 'openai_compatible', name: STAND_IN_NAME, key: STAND_IN_KEY, baseUrl: STAND_IN_URL,
  })) as { provider: Provider }
  const choice = `${provider.id}/${STAND_IN_MODEL}`
  await call('set-model-defaults', { conversation: choice, worker: choice })
  const agents: AgentChoices[] = []
  for (const { id } of (await call('get-agents', undefined)) as { id: string }[]) {
    const own = (await call('get-agent-models', { agentId: id })) as { conversation: Choice; worker: Choice }
    if (!own.conversation && !own.worker) continue
    agents.push({ agentId: id, conversation: valueOf(own.conversation), worker: valueOf(own.worker) })
    await call('set-agent-models', { agentId: id, conversation: null, worker: null })
  }
  writeRecord({ providerId: provider.id, conversation: valueOf(before.conversation), worker: valueOf(before.worker), agents })
})
