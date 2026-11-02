/** A run keeps the organisation's feature switches hq sent with the instruction that started it (adr-0172). */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withRequestSwitches } from '../../features/siteFeatures'

const h = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(),
  transcriptCreate: vi.fn(),
  runCreate: vi.fn(),
  engineRun: vi.fn(),
}))

vi.mock('#db', () => ({
  prisma: {
    agentSession: { findUnique: h.sessionFindUnique, update: vi.fn() },
    transcriptEntry: { create: h.transcriptCreate },
    agentRun: { create: h.runCreate, findFirst: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}))
vi.mock('../../../agents/runtime/AgentEngine', () => ({ agentEngine: { run: h.engineRun } }))
vi.mock('../deferredManifestReport', () => ({ reportDeferredManifestIfAny: vi.fn().mockResolvedValue(undefined) }))

import { runChat } from '../chatExecution'

function payload(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'chat',
    startedBy: 'person',
    capabilityJwt: 'jwt',
    session: { id: 'sess-1' },
    inputText: 'Use the staging bucket',
    model: null,
    hideUserMessage: false,
    context: {
      agent: { id: 'agent-1', handle: 'bot', approval: 'bypassed', allowedTools: null, allowedBashPatterns: null, defaultModel: 'm' },
      chat: { sessionContext: null },
      packages: {
        agent: { kind: 'agent', key: 'agent-1', digest: 'a'.repeat(64) },
        org: null,
        platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
      },
    },
    ...overrides,
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  h.sessionFindUnique.mockResolvedValue({ title: 'Already named' })
  h.runCreate.mockResolvedValue({ id: 'run-1' })
  h.engineRun.mockResolvedValue({ status: 'COMPLETED' })
})

describe("a run's feature switches", () => {
  it('are the switches of the request that started it, handed to the engine for every turn', async () => {
    await withRequestSwitches({ usageBilling: true }, () => runChat(payload()))
    expect(h.engineRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ features: { usageBilling: true } }))
  })

  it('are none from an hq that sends none', async () => {
    await withRequestSwitches(undefined, () => runChat(payload()))
    expect(h.engineRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ features: {} }))
  })
})
