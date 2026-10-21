import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(),
  sessionUpdate: vi.fn(),
  transcriptCreate: vi.fn(),
  runCreate: vi.fn(),
  runFindFirst: vi.fn(),
  engineRun: vi.fn(),
}))

vi.mock('#db', () => ({
  prisma: {
    agentSession: { findUnique: h.sessionFindUnique, update: h.sessionUpdate },
    transcriptEntry: { create: h.transcriptCreate },
    agentRun: { create: h.runCreate, findFirst: h.runFindFirst, updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}))
vi.mock('../../../agents/runtime/AgentEngine', () => ({ agentEngine: { run: h.engineRun } }))
vi.mock('../deferredManifestReport', () => ({ reportDeferredManifestIfAny: vi.fn().mockResolvedValue(undefined) }))

import { runChat } from '../chatExecution'

function payload(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'chat',
    capabilityJwt: 'jwt',
    session: { id: 'sess-1', title: 'New Conversation' },
    inputText: 'Build a billing dashboard for the finance team please',
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
  h.runCreate.mockResolvedValue({ id: 'run-1' })
  h.engineRun.mockResolvedValue({ status: 'COMPLETED' })
  h.sessionUpdate.mockResolvedValue({})
})

describe('site writes the auto-generated session title', () => {
  it("titles a session still named 'New Conversation' from the first message, on site's own row", async () => {
    h.sessionFindUnique.mockResolvedValue({ title: 'New Conversation' })
    await runChat(payload())
    expect(h.sessionUpdate).toHaveBeenCalledWith({ where: { id: 'sess-1' }, data: { title: 'Build a billing dashboard for the...' } })
    expect(h.engineRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ sessionTitle: 'Build a billing dashboard for the...' }))
    expect(h.runCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ agentPackageDigest: 'a'.repeat(64) }) })
  })

  it('leaves an already-titled session alone', async () => {
    h.sessionFindUnique.mockResolvedValue({ title: 'Renamed by me' })
    await runChat(payload())
    expect(h.sessionUpdate).not.toHaveBeenCalled()
    expect(h.engineRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ sessionTitle: null }))
  })

  it('does not title from a hidden message', async () => {
    h.sessionFindUnique.mockResolvedValue({ title: 'New Conversation' })
    await runChat(payload({ hideUserMessage: true }))
    expect(h.sessionUpdate).not.toHaveBeenCalled()
  })
})
