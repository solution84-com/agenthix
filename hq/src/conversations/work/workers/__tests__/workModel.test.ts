import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Resolution } from '@agenthix/core'

const runModel = vi.hoisted(() => ({
  chooseBoundaryRun: vi.fn(async () => ({ model: 'm', runtime: 'claude-sdk', resolution: null, problem: null })),
  chooseKeptSessionRun: vi.fn(async () => ({ model: 'kept', runtime: 'opencode', resolution: null, problem: null })),
}))
vi.mock('../../../../agents/runModel', () => runModel)
vi.mock('../../../access/talkingModel', async () => ({
  choiceLabel: async (c: { providerId: string; model: string }) => `${c.model} · via ${c.providerId}`,
  parseChoiceValue: (v: unknown) => (typeof v === 'string' ? { providerId: v.split('/')[0], model: v.slice(v.indexOf('/') + 1) } : null),
}))
vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../sealing', () => ({ openJson: (s: string) => JSON.parse(s), sealJson: (v: unknown) => JSON.stringify(v) }))

import { briefChoice, fellBackLine } from '../workModel'

const op = { conversationId: 'c1', boundaryType: 'project', boundaryId: 'pr1', authorisedById: 'u1', args: JSON.stringify({ model: 'p-or/deepseek/deepseek-v3.2' }) }
const session = { userId: 'u1', runtime: 'opencode', model: 'openrouter/openai/gpt-5' }

beforeEach(() => vi.clearAllMocks())

describe("a brief's model @SC-955", () => {
  it("is chosen with the conversation, so it takes the conversation's model unless the person's words named one", async () => {
    await briefChoice(op, session, { id: 'a1' })
    expect(runModel.chooseBoundaryRun).toHaveBeenCalledWith(
      { type: 'project', id: 'pr1' }, 'a1', 'u1', { providerId: 'p-or', model: 'deepseek/deepseek-v3.2' }, 'c1',
    )
  })

  it('stays on its session’s model when its run carries on: a change of the conversation’s model waits for the next brief', async () => {
    const choice = await briefChoice(op, session, { id: 'a1' }, true)
    expect(choice.model).toBe('kept')
    expect(runModel.chooseBoundaryRun).not.toHaveBeenCalled()
    expect(runModel.chooseKeptSessionRun).toHaveBeenCalledWith({
      agentId: 'a1', boundary: { type: 'project', id: 'pr1' }, userId: 'u1', session: { runtime: 'opencode', model: 'openrouter/openai/gpt-5' },
    })
  })
})

describe('the line a run that fell back keeps', () => {
  const r = (over: Partial<Resolution>): Resolution => ({
    purpose: 'worker', model: { providerId: 'OpenRouter', model: 'deepseek-v3.2' }, providerName: 'OpenRouter', vendor: 'openrouter',
    runtime: 'opencode', from: 'agent', basis: 'ESTIMATED', billingProfileId: 'bp', ...over,
  })

  it('says what it ran on and why its first model was not used', async () => {
    const line = await fellBackLine(r({ fellBack: { from: { providerId: 'Anthropic', model: 'claude-opus-5' }, reason: 'model_not_allowed' } }))
    expect(line).toBe('Ran on deepseek-v3.2 · via OpenRouter: claude-opus-5 · via Anthropic is not allowed for this work.')
    const down = await fellBackLine(r({ fellBack: { from: { providerId: 'Anthropic', model: 'claude-opus-5' }, reason: 'provider_not_working' } }))
    expect(down).toContain("is on a provider that isn't working")
  })

  it('is none when nothing fell back', async () => {
    expect(await fellBackLine(r({}))).toBeNull()
    expect(await fellBackLine(null)).toBeNull()
  })
})
