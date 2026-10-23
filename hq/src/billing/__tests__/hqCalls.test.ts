import { describe, expect, it } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import type { ResolvedAccess, TurnUsage } from '../../conversations/contract'
import { createModelAdapter } from '../../conversations/model'
import { anthropicAccess, requestFor, streamingModel, textChunks, usageOf } from '../../conversations/model/testSupport'
import { costedFor, costedToTurn, hqCallRow } from '../sources/hqCalls'

const costed: ResolvedAccess = {
  ...anthropicAccess,
  costing: { purpose: 'conversation', basis: 'ESTIMATED', billingProfileId: 'bp-1', projectId: 'proj-1', agentId: 'a-1', userId: 'u-1', conversationId: 'c-1' },
}

describe("hq's own calls on the ledger @SC-1213", () => {
  it('records each streamed step once, with its usage', async () => {
    const steps: { access: ResolvedAccess; usage: TurnUsage }[] = []
    const adapter = createModelAdapter({
      languageModel: () => streamingModel(textChunks(['Hi'], usageOf({ total: 120, noCache: 20, cacheRead: 100 }, 7))),
      record: (access, usage) => steps.push({ access, usage }),
    })
    for await (const _ of adapter.stream(requestFor({ access: costed }))) { /* drain */ }
    expect(steps).toEqual([{ access: costed, usage: { inputTokens: 20, outputTokens: 7, cacheReadTokens: 100, cacheWriteTokens: 0 } }])
  })

  it('records a completed call', async () => {
    const steps: TurnUsage[] = []
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'A title' }], finishReason: { unified: 'stop', raw: 'stop' },
        usage: usageOf({ total: 30 }, 4), warnings: [],
      }),
    })
    await createModelAdapter({ languageModel: () => model, record: (_a, u) => steps.push(u) }).complete(requestFor({ access: costed }))
    expect(steps).toEqual([{ inputTokens: 30, outputTokens: 4, cacheReadTokens: 0, cacheWriteTokens: 0 }])
  })

  it('makes a row with a call id of its own, the place and the provider, and none for an access that is not costed', () => {
    const at = new Date('2026-10-23T10:00:00Z')
    const usage = { inputTokens: 5, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }
    const a = hqCallRow(costedToTurn(costed, 'turn-1'), usage, at)
    const b = hqCallRow(costed, usage, at)
    expect(a).toMatchObject({
      purpose: 'conversation', billingProfileId: 'bp-1', providerId: 'p-ant', providerName: 'Anthropic', vendor: 'anthropic',
      model: 'claude-test', turnId: 'turn-1', conversationId: 'c-1', at, usage: { inputTokens: 5, audioMs: 0, characters: 0 },
    })
    expect(a!.callId).not.toBe(b!.callId)
    expect(hqCallRow(anthropicAccess, usage, at)).toBeNull()
  })

  it('costs a title on the turn access as a title, and to no turn', () => {
    const title = costedFor(costedToTurn(costed, 'turn-1'), 'title')
    expect(title.costing).toMatchObject({ purpose: 'title', billingProfileId: 'bp-1' })
    expect(title.costing?.turnId).toBeUndefined()
  })
})
