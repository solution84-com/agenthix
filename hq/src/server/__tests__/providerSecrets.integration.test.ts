import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

// Provider keys at rest, against the real test database: stored encrypted, read
// back in the clear, a key in the clear treated as none and removed at boot,
// and the org's model keys per provider (spec §6).

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 9).toString('base64')

import {
  getProviderKey, setProviderKey, looksEncrypted, getLlmApiKey,
  getOrgModelKey, setOrgModelKey, getWebSearchKey, setWebSearchKey,
} from '../providerService'
import { encryptSecret, decryptSecret } from '../crypto/secretCrypto'
import { discardPlaintextSecrets } from '../boot/discardPlaintextSecrets'

const row = (service: string, name: string) => prisma.provider.findUnique({ where: { service_name: { service, name } } })
const put = (service: string, name: string, apiKey: string, config?: object) =>
  prisma.provider.create({ data: { service, name, apiKey, ...(config ? { config } : {}) } })

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('providerService — encryption at rest', () => {
  it('stores a key encrypted and reads it back in the clear', async () => {
    await setProviderKey('llm', 'anthropic', 'sk-secret')
    const stored = (await row('llm', 'anthropic'))!.apiKey
    expect(stored).not.toContain('sk-secret')
    expect(looksEncrypted(stored)).toBe(true)
    expect(await getProviderKey('llm', 'anthropic')).toBe('sk-secret')
    expect(await getLlmApiKey('anthropic')).toBe('sk-secret')
  })

  it('treats a row written in the clear as no key, without failing, and a missing row as none', async () => {
    await put('llm', 'anthropic', 'sk-plaintext-legacy')
    expect(await getProviderKey('llm', 'anthropic')).toBeNull()
    expect(await getProviderKey('llm', 'openai')).toBeNull()
  })

  it('updates an existing row in place rather than creating a duplicate', async () => {
    await setProviderKey('llm', 'anthropic', 'sk-old')
    await setProviderKey('llm', 'anthropic', 'sk-new')
    expect(await prisma.provider.count()).toBe(1)
    expect(await getProviderKey('llm', 'anthropic')).toBe('sk-new')
  })

  // An empty secret would encrypt to a shape looksEncrypted reads as not
  // encrypted, and come back as though it were the key.
  it('rejects an empty value rather than writing a key that would round-trip wrong', async () => {
    await expect(setProviderKey('llm', 'anthropic', '')).rejects.toThrow()
    expect(await prisma.provider.count()).toBe(0)
  })
})

describe('discardPlaintextSecrets — boot pass', () => {
  it('removes every row stored in the clear, without converting it, and leaves encrypted rows alone', async () => {
    await put('llm', 'anthropic', 'sk-plaintext')
    await put('tts', 'inworld', encryptSecret('sk-existing'))

    expect(await discardPlaintextSecrets()).toBe(1)

    expect(await row('llm', 'anthropic')).toBeNull()
    expect(decryptSecret((await row('tts', 'inworld'))!.apiKey)).toBe('sk-existing')
  })

  it('is idempotent — a second pass removes nothing', async () => {
    await put('llm', 'anthropic', 'sk-plaintext')
    await discardPlaintextSecrets()
    expect(await discardPlaintextSecrets()).toBe(0)
  })

  it('keeps an OpenAI-compatible endpoint stored without a key — no key is not a key in the clear', async () => {
    await put('llm', 'openai_compatible', '', { baseUrl: 'http://gpu/v1' })
    await put('llm', 'openai', '')
    expect(await discardPlaintextSecrets()).toBe(1)
    expect(await row('llm', 'openai_compatible')).not.toBeNull()
    expect(await row('llm', 'openai')).toBeNull()
  })

  it('never throws when the database refuses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const refusal = vi.spyOn(prisma.provider, 'findMany').mockRejectedValueOnce(new Error('db down'))
    try {
      await expect(discardPlaintextSecrets()).resolves.toBe(0)
    } finally {
      refusal.mockRestore()
    }
  })
})

describe("the org's model keys per provider (spec §6)", () => {
  it("reads a provider's own row", async () => {
    await put('llm', 'openrouter', encryptSecret('sk-or-1'))
    await put('llm', 'openai', encryptSecret('sk-oa'))
    expect(await getOrgModelKey('openrouter')).toEqual({ apiKey: 'sk-or-1' })
  })

  it('stores an endpoint without a key as an empty key with its base URL, and reads it back either way', async () => {
    await setOrgModelKey('openai_compatible', '', 'http://gpu/v1')
    expect(await row('llm', 'openai_compatible')).toMatchObject({ apiKey: '', config: { baseUrl: 'http://gpu/v1' } })
    expect(await getOrgModelKey('openai_compatible')).toEqual({ apiKey: '', baseUrl: 'http://gpu/v1' })

    await setOrgModelKey('openai_compatible', 'lan-key', 'http://gpu/v1')
    const stored = (await row('llm', 'openai_compatible'))!.apiKey
    expect(stored).not.toContain('lan-key')
    expect(looksEncrypted(stored)).toBe(true)
    expect(await getOrgModelKey('openai_compatible')).toEqual({ apiKey: 'lan-key', baseUrl: 'http://gpu/v1' })
  })

  it('an endpoint with no base URL, or a key in the clear, is not usable; an empty key is no key for any other provider', async () => {
    await put('llm', 'openai_compatible', '')
    expect(await getOrgModelKey('openai_compatible')).toBeNull()
    await prisma.provider.update({ where: { service_name: { service: 'llm', name: 'openai_compatible' } }, data: { apiKey: 'plain', config: { baseUrl: 'http://gpu/v1' } } })
    expect(await getOrgModelKey('openai_compatible')).toBeNull()
    await put('llm', 'openai', '')
    expect(await getOrgModelKey('openai')).toBeNull()
  })

  it('refuses a base URL for any other provider, and an endpoint without one, storing nothing', async () => {
    await expect(setOrgModelKey('openai', 'k', 'http://x')).rejects.toThrow()
    await expect(setOrgModelKey('openai_compatible', 'k')).rejects.toThrow()
    expect(await prisma.provider.count()).toBe(0)
  })

  it("stores and reads the org's Exa key as the ('search', 'exa') row", async () => {
    await setWebSearchKey('exa-1')
    expect(await row('search', 'exa')).not.toBeNull()
    expect(await getWebSearchKey()).toBe('exa-1')
  })
})
