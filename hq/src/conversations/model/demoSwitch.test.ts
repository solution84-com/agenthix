import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamingModel, textChunks, requestFor } from './testSupport'

const h = vi.hoisted(() => ({ vendor: vi.fn(), demo: vi.fn() }))
vi.mock('./providers', async (importOriginal) => ({
  ...await importOriginal<typeof import('./providers')>(),
  languageModelFor: h.vendor,
}))
vi.mock('../../demo/lead', () => ({ demoLeadModel: () => h.demo }))

import { createModelAdapter } from './index'

async function drain(adapter: ReturnType<typeof createModelAdapter>) {
  for await (const _ of adapter.stream(requestFor({ cacheKey: 'conv-9' }))) { /* drained */ }
}

afterEach(() => {
  vi.unstubAllEnvs()
  h.vendor.mockReset()
  h.demo.mockReset()
})

describe('the model behind the lead, by the demo setting (ADR-0186) @SC-1960', () => {
  it("is the vendor's with the setting unset, and the demo's is never asked @SC-1979", async () => {
    vi.stubEnv('DEMO_MODE', '')
    h.vendor.mockReturnValue(streamingModel(textChunks(['Hi'])))
    await drain(createModelAdapter({ record: () => undefined }))
    expect(h.vendor).toHaveBeenCalledTimes(1)
    expect(h.demo).not.toHaveBeenCalled()
  })

  it("is the scripted one with the setting on, for the call's conversation, and no vendor is asked", async () => {
    vi.stubEnv('DEMO_MODE', 'true')
    h.demo.mockReturnValue(streamingModel(textChunks(['Hi'])))
    await drain(createModelAdapter({ record: () => undefined }))
    expect(h.demo).toHaveBeenCalledWith('conv-9')
    expect(h.vendor).not.toHaveBeenCalled()
  })
})

describe('a vendor in demo mode @SC-1960', () => {
  it('is refused before any client is made', async () => {
    const { languageModelFor } = await vi.importActual<typeof import('./providers')>('./providers')
    vi.stubEnv('DEMO_MODE', 'true')
    expect(() => languageModelFor(requestFor().access)).toThrow(/no model provider is called/)
    vi.stubEnv('DEMO_MODE', '')
    expect(languageModelFor(requestFor().access)).toBeTruthy()
  })
})
