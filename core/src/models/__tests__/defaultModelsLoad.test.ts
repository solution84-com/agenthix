import { describe, expect, it, vi } from 'vitest'

describe('loading the default models', () => {
  it('does not throw when the pinned catalogue has no Claude Sonnet: it falls back to the price rule', async () => {
    vi.resetModules()
    vi.doMock('../openCodeModels.generated.js', async () => {
      const real = await vi.importActual<typeof import('../openCodeModels.generated.js')>('../openCodeModels.generated.js')
      const noSonnet = <T extends { value: string }>(list: readonly T[]) => list.filter(m => !/sonnet/i.test(m.value))
      return { ...real, CLAUDE_SDK_MODELS: noSonnet(real.CLAUDE_SDK_MODELS), OPENCODE_MODELS: noSonnet(real.OPENCODE_MODELS) }
    })
    const { DEFAULT_MODELS } = await import('../modelList.js')
    expect(DEFAULT_MODELS['claude-sdk']).toBeTruthy()
    expect(DEFAULT_MODELS.opencode).toBeTruthy()
    vi.doUnmock('../openCodeModels.generated.js')
  })
})
