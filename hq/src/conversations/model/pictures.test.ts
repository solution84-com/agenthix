/**
 * A picture a person shared, as each provider's request body carries it beside the words, through the real provider
 * SDKs with the network replaced: the body is captured and the call refused, so no request leaves the process.
 */
import { describe, expect, it } from 'vitest'
import type { LeadRequest, ModelProvider } from '../contract'
import { createModelAdapter } from './index'
import { languageModelFor } from './providers'
import { anthropicAccess, requestFor } from './testSupport'

type Body = { messages?: Array<{ role: string; content: unknown }> }

async function sentBody(request: LeadRequest): Promise<Body> {
  let captured: Body | null = null
  const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body)) as Body
    return new Response(JSON.stringify({ error: { message: 'refused in a test' } }), { status: 400, headers: { 'content-type': 'application/json' } })
  }) as typeof globalThis.fetch
  const adapter = createModelAdapter({ languageModel: (access, extras) => languageModelFor(access, { ...extras, fetch }), maxRetries: 0 })
  await expect(adapter.complete(request)).rejects.toMatchObject({ kind: 'invalid' })
  if (!captured) throw new Error('nothing was sent')
  return captured
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const B64 = Buffer.from(PNG).toString('base64')
const access = (provider: ModelProvider, model: string) => ({ ...anthropicAccess, provider, model, baseUrl: 'http://compatible.test/v1' })
const withPicture = (provider: ModelProvider, model: string) => requestFor({
  access: access(provider, model),
  messages: [{ role: 'user', content: 'see the screenshot', images: [{ mediaType: 'image/png', data: PNG }] }],
})

describe('a shared picture in the request', () => {
  it('goes to OpenRouter and an OpenAI-compatible endpoint as an image part beside the words', async () => {
    for (const provider of ['openrouter', 'openai_compatible'] as const) {
      const body = await sentBody(withPicture(provider, 'some/model'))
      const user = body.messages!.find(m => m.role === 'user')!
      expect(user.content).toEqual([
        { type: 'text', text: 'see the screenshot' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${B64}` } },
      ])
    }
  })

  it('goes to Anthropic as a base64 image block', async () => {
    const body = await sentBody(withPicture('anthropic', 'claude-sonnet-5'))
    const user = body.messages!.find(m => m.role === 'user')!
    expect(user.content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', text: 'see the screenshot' }),
      expect.objectContaining({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: B64 } }),
    ]))
  })

  it('is left out when the message has none: the words stay a plain string', async () => {
    const body = await sentBody(requestFor({ access: access('openrouter', 'some/model'), messages: [{ role: 'user', content: 'hello' }] }))
    expect(body.messages!.find(m => m.role === 'user')!.content).toBe('hello')
  })
})
