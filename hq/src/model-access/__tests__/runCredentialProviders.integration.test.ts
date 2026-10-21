/**
 * A run's credential by provider (spec §6), against the real test database:
 * each boundary is asked for the provider its model names, an OpenAI-compatible
 * endpoint carries its address, a subscription is never offered to OpenCode,
 * and a turn's fallback models bring one credential per other provider
 * (fallbackCredentials.ts).
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

import { resolveRunCredential, runInOwnHome as own } from '../modelCredential'
import { resolveFallbackCredentials } from '../fallbackCredentials'
import { SDK, OPENCODE, OC_ANTHROPIC, storeKey, storeSubscription, orgKey, peopleInOrg } from './runCredentialFixtures'

beforeEach(async () => {
  // The integration run takes hq's .env.server as its base, which may turn the development switch on.
  vi.stubEnv('HQ_DEV_SHARED_SUBSCRIPTION', '')
  await peopleInOrg(1)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('a model naming no known provider @SC-705', () => {
  it('resolves nothing, reads no credential, and says so', async () => {
    await storeKey('user', 'u1', 'mine')
    const reads = vi.spyOn(prisma.modelCredential, 'findUnique')

    const result = await resolveRunCredential({ type: 'user', id: 'u1' }, own('u1'), OPENCODE, 'mistral/large')

    expect(result.credential).toBeNull()
    expect(result.problem).toContain("'mistral/large'")
    expect(reads).not.toHaveBeenCalled()
  })
})

describe.each(['openrouter', 'openai', 'google'] as const)("each boundary's credential for %s on OpenCode @SC-705", (provider) => {
  const model = `${provider}/some-model`
  const key = (apiKey: string) => ({ credential: { kind: 'apiKey', provider, apiKey }, problem: null })

  beforeEach(async () => {
    await orgKey('anthropic', 'anthropic-org-key')
    await orgKey(provider, `${provider}-org-key`)
    // An Anthropic key the person holds, which must never stand in for another provider's.
    await storeKey('user', 'u1', 'their-anthropic-key')
  })

  it("a person's run uses their own key for the provider", async () => {
    await storeKey('user', 'u1', 'mine', { provider })
    await expect(resolveRunCredential({ type: 'user', id: 'u1' }, own('u1'), OPENCODE, model)).resolves.toEqual(key('mine'))
  })

  it("a person's run falls to the org's key for the provider, never their Anthropic key", async () => {
    await expect(resolveRunCredential({ type: 'user', id: 'u1' }, own('u1'), OPENCODE, model)).resolves.toEqual(key(`${provider}-org-key`))
  })

  it("a project run uses the project's key, then the org's", async () => {
    const projectKey = await storeKey('project', 'p1', 'project-key', { provider })
    await expect(resolveRunCredential({ type: 'project', id: 'p1' }, own('u1'), OPENCODE, model)).resolves.toEqual(key('project-key'))

    await prisma.modelCredential.delete({ where: { id: projectKey.id } })
    await expect(resolveRunCredential({ type: 'project', id: 'p1' }, own('u1'), OPENCODE, model)).resolves.toEqual(key(`${provider}-org-key`))
  })

  it("a project run uses its person's own key for the provider after the project's, before the org's", async () => {
    await storeKey('user', 'u1', 'mine', { provider })
    await expect(resolveRunCredential({ type: 'project', id: 'p1' }, own('u1'), OPENCODE, model)).resolves.toEqual(key('mine'))
    await storeKey('project', 'p1', 'project-key', { provider })
    await expect(resolveRunCredential({ type: 'project', id: 'p1' }, own('u1'), OPENCODE, model)).resolves.toEqual(key('project-key'))
  })

  it("a run with no boundary uses the org's key only", async () => {
    await storeKey('user', 'u1', 'mine', { provider })
    await expect(resolveRunCredential(null, null, OPENCODE, model)).resolves.toEqual(key(`${provider}-org-key`))
  })

  it('with no key for the provider anywhere, fails naming the provider — an Anthropic key does not stand in', async () => {
    await prisma.provider.deleteMany({ where: { name: provider } })
    const { credential, problem } = await resolveRunCredential({ type: 'user', id: 'u1' }, own('u1'), OPENCODE, model)
    expect(credential).toBeNull()
    expect(problem).toContain('API key')
    expect(problem).toContain('Organisation › Settings › Model access')
  })
})

describe('an OpenAI-compatible endpoint @SC-705', () => {
  const model = 'openai_compatible/llama3.3'
  const provider = 'openai_compatible' as const

  it("a person's endpoint carries its base URL and key", async () => {
    await storeKey('user', 'u1', 'local-key', { provider, baseUrl: 'http://localhost:11434/v1' })
    await expect(resolveRunCredential({ type: 'user', id: 'u1' }, own('u1'), OPENCODE, model)).resolves.toEqual({
      credential: { kind: 'apiKey', provider, apiKey: 'local-key', baseUrl: 'http://localhost:11434/v1' },
      problem: null,
    })
  })

  it('an endpoint stored without a key resolves with an empty key', async () => {
    await storeKey('project', 'p1', '', { provider, baseUrl: 'http://gpu.lan:8000/v1' })
    const { credential } = await resolveRunCredential({ type: 'project', id: 'p1' }, own('u1'), OPENCODE, model)
    expect(credential).toEqual({ kind: 'apiKey', provider, apiKey: '', baseUrl: 'http://gpu.lan:8000/v1' })
  })

  it("a row without a base URL is not usable, so the org's endpoint is used", async () => {
    await orgKey(provider, '', 'http://org.lan/v1')
    await storeKey('user', 'u1', 'k', { provider, baseUrl: null })
    const { credential } = await resolveRunCredential({ type: 'user', id: 'u1' }, own('u1'), OPENCODE, model)
    expect(credential).toEqual({ kind: 'apiKey', provider, apiKey: '', baseUrl: 'http://org.lan/v1' })
  })

  it('says to set an endpoint when there is none', async () => {
    const { credential, problem } = await resolveRunCredential(null, null, OPENCODE, model)
    expect(credential).toBeNull()
    expect(problem).toContain('OpenAI-compatible endpoint')
  })
})

describe('a subscription is never offered to OpenCode @SC-704', () => {
  it.each([
    ['a person', { type: 'user', id: 'u1' } as const, 'user', 'u1'],
    ['a project', { type: 'project', id: 'p1' } as const, 'project', 'p1'],
    ['the org', null, 'org', 'org'],
  ] as const)('%s holding only an accepted subscription gets no credential from it on OpenCode', async (_who, boundary, ownerType, ownerId) => {
    await storeSubscription(ownerType, ownerId)
    const { credential } = await resolveRunCredential(boundary, own('u1'), OPENCODE, OC_ANTHROPIC)
    expect(credential).toBeNull()
  })

  it('and the Claude runtime is always Anthropic, whatever the model is called', async () => {
    await storeSubscription('user', 'u1')
    const { credential } = await resolveRunCredential({ type: 'user', id: 'u1' }, own('u1'), SDK, 'openrouter/x')
    expect(credential).toEqual({ kind: 'subscription', provider: 'anthropic', oauthJson: 'oauth-json' })
  })
})

describe("a turn's fallback providers (fallbackCredentials.ts) @SC-705", () => {
  const person = { type: 'user', id: 'u1' } as const

  it('resolves nothing, and reads nothing, when the turn has no fallback model', async () => {
    const reads = vi.spyOn(prisma.modelCredential, 'findUnique')
    await expect(resolveFallbackCredentials(person, own('u1'), OPENCODE, 'openrouter/qwen/q', [])).resolves.toEqual([])
    expect(reads).not.toHaveBeenCalled()
  })

  it("gives each other provider its credential, the boundary's own ahead of the org's", async () => {
    await storeKey('user', 'u1', 'sk-person-openai', { provider: 'openai' })
    await orgKey('openai', 'org-openai')
    await orgKey('google', 'org-google')

    await expect(resolveFallbackCredentials(person, own('u1'), OPENCODE, 'openrouter/qwen/q', ['openai/gpt-5', 'google/gemini-2.5-flash'])).resolves.toEqual([
      { kind: 'apiKey', provider: 'openai', apiKey: 'sk-person-openai' },
      { kind: 'apiKey', provider: 'google', apiKey: 'org-google' },
    ])
  })

  it("never repeats the turn's own provider or one already resolved", async () => {
    for (const p of ['openrouter', 'openai'] as const) await orgKey(p, `org-${p}`)
    await expect(resolveFallbackCredentials(null, null, OPENCODE, 'openrouter/qwen/q', ['openrouter/free', 'openai/a', 'openai/b']))
      .resolves.toEqual([{ kind: 'apiKey', provider: 'openai', apiKey: 'org-openai' }])
  })

  it('leaves out a provider with nothing configured, and a model naming no provider, without failing', async () => {
    await orgKey('anthropic', 'org-anthropic')
    await expect(resolveFallbackCredentials(null, null, OPENCODE, 'openrouter/qwen/q', ['openai/gpt-5', 'nonsense', 'anthropic/claude-sonnet-4-6']))
      .resolves.toEqual([{ kind: 'apiKey', provider: 'anthropic', apiKey: 'org-anthropic' }])
  })

  it("carries a person's own OpenAI-compatible endpoint with its address", async () => {
    await storeKey('user', 'u1', '', { provider: 'openai_compatible', baseUrl: 'http://llm:11434/v1' })
    await expect(resolveFallbackCredentials(person, own('u1'), OPENCODE, 'openrouter/qwen/q', ['openai_compatible/llama3']))
      .resolves.toEqual([{ kind: 'apiKey', provider: 'openai_compatible', apiKey: '', baseUrl: 'http://llm:11434/v1' }])
  })

  it("never offers a subscription: on Claude every fallback is Anthropic, the turn's own provider", async () => {
    await storeSubscription('user', 'u1')
    await expect(resolveFallbackCredentials(person, own('u1'), SDK, 'claude-opus-4-7', ['claude-sonnet-4-6'])).resolves.toEqual([])
  })
})
