import http from 'node:http'
import https from 'node:https'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installProviderGuard, providerHostOf, PROVIDER_HOSTS } from './noProviderCalls'

describe('which hosts are a provider @SC-1150', () => {
  it.each([
    'https://api.anthropic.com/v1/messages',
    'https://api.openai.com/v1/chat/completions',
    'https://openrouter.ai/api/v1/chat',
    'https://streaming.assemblyai.com/v3/ws',
    'https://api.inworld.ai/tts/v1/voice',
    'https://generativelanguage.googleapis.com/v1/models',
    'https://api.exa.ai/search',
  ])('%s', (url) => expect(providerHostOf(url)).not.toBeNull())

  it('is not a local stand-in, GitHub or a look-alike', () => {
    for (const url of ['http://localhost:4100/v1', 'http://127.0.0.1:9/x', 'https://api.github.com', 'https://notanthropic.com', 'https://anthropic.com.evil.example'])
      expect(providerHostOf(url)).toBeNull()
  })

  it('reads a request options object', () => {
    expect(providerHostOf({ hostname: 'api.openai.com' })).toBe('api.openai.com')
    expect(providerHostOf({ host: 'localhost:8080' })).toBeNull()
  })

  it('names the providers the code reaches', () => {
    expect(PROVIDER_HOSTS).toEqual(expect.arrayContaining(['anthropic.com', 'openai.com', 'openrouter.ai', 'assemblyai.com', 'inworld.ai', 'exa.ai']))
  })
})

describe('the guard @SC-1150', () => {
  const real = globalThis.fetch
  let guard: ReturnType<typeof installProviderGuard>
  afterEach(() => { guard?.restore(); globalThis.fetch = real })

  it('refuses a fetch to a provider, naming the test and the host, and records it', async () => {
    const inner = vi.fn(async () => new Response('ok'))
    guard = installProviderGuard(() => 'my test', { fetch: inner as never, http, https })
    await expect(fetch('https://api.anthropic.com/v1/messages')).rejects.toThrow('Test "my test" made an outbound request to api.anthropic.com')
    expect(inner).not.toHaveBeenCalled()
    expect(guard.reached).toHaveLength(1)
  })

  it('lets a local stand-in through', async () => {
    const inner = vi.fn(async () => new Response('ok'))
    guard = installProviderGuard(() => 't', { fetch: inner as never, http, https })
    expect(await (await fetch('http://localhost:1/x')).text()).toBe('ok')
    expect(guard.reached).toEqual([])
  })

  it('refuses an https request to a provider', async () => {
    guard = installProviderGuard(() => 't', { fetch: real, http, https })
    expect(() => https.request({ hostname: 'api.openai.com', path: '/' })).toThrow('api.openai.com')
    expect(() => https.get('https://api.openai.com/')).toThrow('api.openai.com')
  })
})
