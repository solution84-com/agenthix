import { describe, expect, it, vi } from 'vitest'
import type { ResolveRequest } from '@agenthix/core'
import type { Snapshot } from '../../routing/decide'

const snap: Snapshot = {
  providers: [
    { id: 'p-ant', name: 'Anthropic', vendor: 'anthropic', credentialKind: 'api_key', state: 'key_refused', ownerUserId: null },
    { id: 'p-or', name: 'OpenRouter', vendor: 'openrouter', credentialKind: 'api_key', state: 'works', ownerUserId: null },
  ],
  org: { conversation: null, stt: null, tts: null }, agent: null, agentName: null,
  lists: [{ mode: 'every', entries: [{ effect: 'never', pattern: 'openai/*' }] }],
  conversationModel: null, billingProfileId: 'bp',
}
vi.mock('../../routing/snapshot', () => ({ readSnapshot: vi.fn(async () => snap) }))
vi.mock('wasp/server', () => ({ prisma: {}, HttpError: class extends Error {} }))

import { offeredFor } from '../offered'

const req: ResolveRequest = { purpose: 'conversation', place: { kind: 'organisation' } }

describe('the models a picker offers @SC-1198', () => {
  it('lists a model of a provider that is not working, marked, and one that works, plain', async () => {
    const { models } = await offeredFor(req)
    const anthropic = models.filter(m => m.value.startsWith('p-ant/'))
    const router = models.filter(m => m.value.startsWith('p-or/'))
    expect(anthropic.length).toBeGreaterThan(0)
    expect(anthropic.every(m => m.notWorking === true && m.via === 'via Anthropic')).toBe(true)
    expect(router.length).toBeGreaterThan(0)
    expect(router.every(m => m.notWorking === undefined && m.via === 'via OpenRouter')).toBe(true)
  })

  it('leaves out what a list rules out, even on a provider that is not working', async () => {
    const { models } = await offeredFor(req)
    expect(models.some(m => m.maker === 'OpenAI')).toBe(false)
    expect(models.some(m => m.value.includes('claude'))).toBe(true)
  })

  it('values a choice as the provider and the model', async () => {
    const { models, byValue } = await offeredFor(req)
    expect(byValue.get(models[0].value)).toBe(models[0])
    expect(models[0].value.startsWith('p-')).toBe(true)
  })

  it('says which models see a picture, from the catalogue: the baseline flash model does, DeepSeek Pro reads text only', async () => {
    const { byValue } = await offeredFor(req)
    expect(byValue.get('p-or/~deepseek/deepseek-flash-latest')?.images).toBe(true)
    expect(byValue.get('p-or/~deepseek/deepseek-pro-latest')?.images).toBe(false)
    expect(byValue.get('p-ant/claude-sonnet-5')?.images).toBe(true)
  })
})
