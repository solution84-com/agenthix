import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

// Provider keys at rest, against the real test database: stored encrypted, read
// back in the clear, and a key in the clear treated as none and removed at boot.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 9).toString('base64')

import {
  getProviderKey, setProviderKey, looksEncrypted, getWebSearchKey, setWebSearchKey,
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
