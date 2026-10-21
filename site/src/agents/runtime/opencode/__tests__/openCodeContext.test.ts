import { describe, it, expect, vi } from 'vitest'
import { modelLimit, modelLimitIn, openCodeContextUse } from '../openCodeContext'
import type { OpenCodeServers } from '../openCodeServers'

const model = { providerID: 'openrouter', modelID: 'qwen/qwen3', provider: 'openrouter' } as const
const providers = (limit: Record<string, number>) =>
  JSON.stringify({ providers: [{ id: 'openrouter', models: { 'qwen/qwen3': { limit } } }], default: {} })

describe("an OpenCode session's memory against its model @SC-775", () => {
  it("reads the model's limits from OpenCode's provider list", () => {
    expect(modelLimitIn(providers({ context: 128_000, output: 16_000 }), model)).toEqual({ context: 128_000, output: 16_000 })
    expect(modelLimitIn(providers({ context: 0, output: 1 }), model)).toBeNull()
    expect(modelLimitIn('not json', model)).toBeNull()
  })

  it('summarises where OpenCode does: its window less its largest reply, or its input limit less a reserve', () => {
    const at = new Date('2026-10-10T10:40:00Z')
    expect(openCodeContextUse(60_000, { context: 128_000, output: 16_000 }, at)).toEqual({ tokens: 60_000, summarisesAt: 112_000, window: 128_000, at: at.toISOString() })
    expect(openCodeContextUse(1, { context: 200_000, output: 64_000 }, at).summarisesAt).toBe(168_000)
    expect(openCodeContextUse(1, { context: 400_000, input: 272_000, output: 128_000 }, at).summarisesAt).toBe(252_000)
  })

  it('asks a container once for a model', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200, body: providers({ context: 128_000, output: 16_000 }) })
    const servers = { request } as unknown as OpenCodeServers
    await modelLimit(servers, 'c-once', model, 'directory=%2Fw')
    expect(await modelLimit(servers, 'c-once', model, 'directory=%2Fw')).toEqual({ context: 128_000, output: 16_000 })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('c-once', 'GET', '/config/providers?directory=%2Fw', undefined, expect.any(Number))
  })
})
