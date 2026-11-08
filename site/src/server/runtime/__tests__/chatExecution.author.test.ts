/** Every person's message records who sent it (every-screen-reviewed spec §9, "Names on messages"). */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

describe("a message records who sent it @SC-519", () => {
  it('writes the sender on the message and the run', async () => {
    await runChat(payload({ onBehalfOfUserId: 'u-ana' }))
    expect(h.transcriptCreate).toHaveBeenCalledWith({
      data: { sessionId: 'sess-1', runId: 'run-1', role: 'USER', authorId: 'u-ana', content: 'Use the staging bucket' },
    })
    expect(h.runCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { dispatch: expect.objectContaining({ kind: 'chat', onBehalfOfUserId: 'u-ana' }) },
      }),
    })
  })

  it('leaves the author empty when hq names nobody', async () => {
    await runChat(payload())
    expect(h.transcriptCreate).toHaveBeenCalledWith({
      data: { sessionId: 'sess-1', runId: 'run-1', role: 'USER', authorId: null, content: 'Use the staging bucket' },
    })
    const blob = (h.runCreate.mock.calls[0][0] as { data: { metadata: { dispatch: Record<string, unknown> } } }).data.metadata.dispatch
    expect(blob).not.toHaveProperty('onBehalfOfUserId')
  })
})

describe('a message names the run it started @SC-773', () => {
  it('is written once the run exists, before the run is started', async () => {
    h.engineRun.mockImplementation(async () => {
      expect(h.transcriptCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ runId: 'run-1', role: 'USER' }) })
      return { status: 'COMPLETED' }
    })
    await runChat(payload())
    expect(h.runCreate.mock.invocationCallOrder[0]).toBeLessThan(h.transcriptCreate.mock.invocationCallOrder[0])
  })
})

describe('Summarise now @SC-776', () => {
  it('runs the hidden summarise request as a summarise turn, writing no message', async () => {
    await runChat(payload({ inputText: '/compact', hideUserMessage: true }))
    expect(h.transcriptCreate).not.toHaveBeenCalled()
    expect(h.engineRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ summarise: true }))
  })

  it('treats the same words typed by a person as an ordinary message', async () => {
    await runChat(payload({ inputText: '/compact' }))
    expect(h.engineRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ summarise: false }))
  })
})

describe('the skill a person picked with /', () => {
  it('goes to the engine by name when hq sent one of a skill name’s shape, and not otherwise; the text is kept', async () => {
    await runChat(payload({ skill: { name: 'org-review' } }))
    expect(h.engineRun).toHaveBeenLastCalledWith('run-1', expect.objectContaining({ pickedSkill: 'org-review' }))
    for (const skill of [{ name: '/init' }, { name: 7 }, 'org-review', undefined]) {
      await runChat(payload({ skill } as never))
      expect(h.engineRun.mock.lastCall?.[1]).toMatchObject({ pickedSkill: undefined })
    }
    expect(h.transcriptCreate).toHaveBeenLastCalledWith({ data: expect.objectContaining({ content: 'Use the staging bucket' }) })
  })
})

describe("a routine's run (adr-0177)", () => {
  it('records the routine on the run, and no routine on any other', async () => {
    await runChat(payload({ routineId: 'rt-1' }))
    expect(h.runCreate).toHaveBeenLastCalledWith({ data: expect.objectContaining({ routineId: 'rt-1' }) })
    await runChat(payload())
    expect(h.runCreate).toHaveBeenLastCalledWith({ data: expect.objectContaining({ routineId: null }) })
  })
})
