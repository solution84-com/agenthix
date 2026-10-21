import { describe, it, expect, vi, beforeEach } from 'vitest'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})

const mockDeliverPackages = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../packages/packageDelivery', async () => {
  const actual = await vi.importActual<typeof import('../../packages/packageDelivery')>('../../packages/packageDelivery')
  return { ...actual, deliverPackages: mockDeliverPackages }
})


import { RUNTIME_METHODS, type SessionSeed, type RunPackages } from '@agenthix/core'
import {
  createSession,
  getSession,
  renameSession,
  archiveSession,
  deleteSession,
  deleteSessionsBy,
  clearSessionRuns,
  getRun,
  listRuns,
  countRuns,
  runStats,
  listActiveRuns,
  listTranscript,
  listToolCalls,
  cancelRun,
  rejectRun,
  approveRun,
  stopAgent,
  promptPreview,
  DELETE_SESSIONS_EMPTY_SELECTOR_MESSAGE,
} from '../siteRuntimeStore'

beforeEach(() => {
  vi.clearAllMocks()
})

const SITE = 'site-logical-1'

const SEED: SessionSeed = {
  id: 's1',
  sessionKey: 'key1',
  agentId: 'a1',
  userId: 'u1',
  sessionType: 'chat',
  taskId: null,
  title: 'Hello',
  model: null,
  metadata: {},
  primaryOwnerType: null,
  primaryOwnerId: null,
  primaryWorkspaceId: null,
  runtime: 'claude-sdk',
  createdAt: new Date().toISOString(),
}

// ── Every method name comes from RUNTIME_METHODS ────────────────────────────

describe('runtime store method names @SC-338', () => {
  it('every typed function calls the channel with its RUNTIME_METHODS constant and the given siteId', async () => {
    request.mockResolvedValue({})

    const calls: Array<[string, () => Promise<unknown>]> = [
      [RUNTIME_METHODS.sessionCreate, () => createSession(SITE, SEED)],
      [RUNTIME_METHODS.sessionGet, () => getSession(SITE, 's1')],
      [RUNTIME_METHODS.sessionRename, () => renameSession(SITE, 's1', 'New title')],
      [RUNTIME_METHODS.sessionArchive, () => archiveSession(SITE, 's1')],
      [RUNTIME_METHODS.sessionDelete, () => deleteSession(SITE, 's1')],
      [RUNTIME_METHODS.sessionDeleteMany, () => deleteSessionsBy(SITE, { userId: 'u1' })],
      [RUNTIME_METHODS.sessionClearRuns, () => clearSessionRuns(SITE, 's1')],
      [RUNTIME_METHODS.runGet, () => getRun(SITE, 'r1')],
      [RUNTIME_METHODS.runList, () => listRuns(SITE, { sessionId: 's1' })],
      [RUNTIME_METHODS.runCount, () => countRuns(SITE, { sessionId: 's1' })],
      [RUNTIME_METHODS.runStats, () => runStats(SITE)],
      [RUNTIME_METHODS.runListActive, () => listActiveRuns(SITE, { ownerType: 'project', ownerId: 'p1' })],
      [RUNTIME_METHODS.transcriptList, () => listTranscript(SITE, 's1')],
      [RUNTIME_METHODS.toolCallList, () => listToolCalls(SITE, 'r1')],
      [RUNTIME_METHODS.runCancel, () => cancelRun(SITE, 'r1')],
      [RUNTIME_METHODS.runReject, () => rejectRun(SITE, 'r1', 'because')],
      [RUNTIME_METHODS.agentStop, () => stopAgent(SITE, 'handle-1')],
      [RUNTIME_METHODS.agentPromptPreview, () => promptPreview(SITE, {
        agent: {
          id: 'a1', name: 'Agent', handle: 'handle-1', role: null, runtime: 'claude-sdk', approval: 'immediate' as const,
          defaultModel: 'claude-sonnet-5', allowedTools: null, allowedBashPatterns: null,
          isKernel: false,
        },
        sessionType: 'chat',
        packages: {
          agent: { kind: 'agent', key: 'a1', digest: 'a'.repeat(64) },
          org: null,
          platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
        },
      })],
    ]

    for (const [method, call] of calls) {
      request.mockClear()
      await call()
      expect(request).toHaveBeenCalledTimes(1)
      expect(request.mock.calls[0][0]).toBe(SITE)
      expect(request.mock.calls[0][1]).toBe(method)
    }
  })

  it('names the person who answered a request, and leaves the name off when there is none', async () => {
    request.mockResolvedValue({ approved: true })
    await approveRun(SITE, 'r1', 'user-9')
    expect(request.mock.calls[0][2]).toEqual({ runId: 'r1', decidedBy: 'user-9' })
    await rejectRun(SITE, 'r1', 'no', 'user-9')
    expect(request.mock.calls[1][2]).toEqual({ runId: 'r1', reason: 'no', decidedBy: 'user-9' })

    request.mockClear()
    await approveRun(SITE, 'r1')
    await rejectRun(SITE, 'r1', 'no')
    expect(request.mock.calls[0][2]).toEqual({ runId: 'r1' })
    expect(request.mock.calls[1][2]).toEqual({ runId: 'r1', reason: 'no' })
  })

  it('listTranscript forwards tail through to the channel — finding 1', async () => {
    request.mockResolvedValue([])
    await listTranscript(SITE, 's1', { tail: true, limit: 1000 })
    expect(request.mock.calls[0][2]).toEqual({ sessionId: 's1', limit: 1000, tail: true })

    request.mockClear()
    request.mockResolvedValue([])
    await listTranscript(SITE, 's1')
    expect(request.mock.calls[0][2]).toEqual({ sessionId: 's1', limit: undefined, tail: undefined })
  })

  it('run.list and run.count accept the exact same RunListFilter object', async () => {
    request.mockResolvedValue([])
    const filter = { taskId: 't1', limit: 1 }
    await listRuns(SITE, filter)
    expect(request.mock.calls[0][2]).toEqual(filter)

    request.mockClear()
    request.mockResolvedValue({ count: 0 })
    await countRuns(SITE, filter)
    expect(request.mock.calls[0][2]).toEqual(filter)
  })

  // Follow-up to person-scoped execution spec §2: an ordinary Stop passes no
  // reason; interruptIfBusy passes 'interrupted' so the site can record it
  // distinctly from "Cancelled by user".
  it('cancelRun forwards no reason by default, and "interrupted" when given', async () => {
    request.mockResolvedValue({ ok: true })
    await cancelRun(SITE, 'r1')
    expect(request.mock.calls[0][2]).toEqual({ runId: 'r1', reason: undefined })

    request.mockClear()
    request.mockResolvedValue({ ok: true })
    await cancelRun(SITE, 'r1', 'interrupted')
    expect(request.mock.calls[0][2]).toEqual({ runId: 'r1', reason: 'interrupted' })
  })

  // every-screen-reviewed spec §9: the run records who stopped it.
  it('cancelRun names who stopped the run, and leaves the name off when nobody did @SC-523', async () => {
    request.mockResolvedValue({ ok: true })
    await cancelRun(SITE, 'r1', 'interrupted', 'ana')
    expect(request.mock.calls[0][2]).toEqual({ runId: 'r1', reason: 'interrupted', by: 'ana' })

    request.mockClear()
    await cancelRun(SITE, 'r1')
    expect(request.mock.calls[0][2]).toEqual({ runId: 'r1', reason: undefined })
  })
})

// ── Title truncation ────────────────────────────────────────────────────────

describe('title truncation @SC-338', () => {
  it('createSession truncates a title over 500 chars to exactly 500', async () => {
    request.mockResolvedValue({ ok: true })
    const longTitle = 'x'.repeat(501)

    await createSession(SITE, { ...SEED, title: longTitle })

    const params = request.mock.calls[0][2] as { title: string }
    expect(params.title).toHaveLength(500)
    expect(params.title).toBe('x'.repeat(500))
  })

  it('createSession leaves a title at or under 500 chars untouched', async () => {
    request.mockResolvedValue({ ok: true })
    const title = 'x'.repeat(500)

    await createSession(SITE, { ...SEED, title })

    expect((request.mock.calls[0][2] as { title: string }).title).toBe(title)
  })

  it('createSession leaves a null title as null', async () => {
    request.mockResolvedValue({ ok: true })

    await createSession(SITE, { ...SEED, title: null })

    expect((request.mock.calls[0][2] as { title: string | null }).title).toBeNull()
  })

  it('renameSession truncates a title over 500 chars to exactly 500', async () => {
    request.mockResolvedValue({ updated: true })
    const longTitle = 'y'.repeat(600)

    await renameSession(SITE, 's1', longTitle)

    const params = request.mock.calls[0][2] as { id: string; title: string }
    expect(params.id).toBe('s1')
    expect(params.title).toHaveLength(500)
  })
})

// ── Empty-selector guard on deleteSessionsBy ────────────────────────────────

describe('deleteSessionsBy empty-selector guard @SC-338', () => {
  it('throws before calling the channel when the selector is entirely empty', async () => {
    await expect(deleteSessionsBy(SITE, {})).rejects.toThrow(DELETE_SESSIONS_EMPTY_SELECTOR_MESSAGE)
    expect(request).not.toHaveBeenCalled()
  })

  it('does not throw and calls the channel when at least one selector field is present', async () => {
    request.mockResolvedValue({ deleted: 3 })

    await expect(deleteSessionsBy(SITE, { taskId: 't1' })).resolves.toEqual({ deleted: 3 })

    expect(request).toHaveBeenCalledWith(SITE, RUNTIME_METHODS.sessionDeleteMany, { taskId: 't1' })
  })

  it('an ids-only selector is not treated as empty', async () => {
    request.mockResolvedValue({ deleted: 1 })

    await expect(deleteSessionsBy(SITE, { ids: ['s1'] })).resolves.toEqual({ deleted: 1 })
  })
})

const PACKAGES: RunPackages = {
  agent: { kind: 'agent', key: 'a1', digest: 'a'.repeat(64) },
  org: null,
  platform: { kind: 'platform', key: 'platform', digest: 'b'.repeat(64) },
}

/** deliverPackages must have been called, and called strictly before the channel request. */
function expectDeliveredBeforeRequest(): void {
  expect(mockDeliverPackages).toHaveBeenCalledWith(SITE, PACKAGES)
  expect(request).toHaveBeenCalledTimes(1)
  const deliverOrder = mockDeliverPackages.mock.invocationCallOrder[0]
  const requestOrder = request.mock.invocationCallOrder[0]
  expect(deliverOrder).toBeLessThan(requestOrder)
}

describe('promptPreview delivers packages before previewing', () => {
  const AGENT_CONFIG = {
    id: 'a1', name: 'Agent', handle: 'handle-1', role: null, runtime: 'claude-sdk', approval: 'immediate' as const,
    defaultModel: 'claude-sonnet-5', allowedTools: null, allowedBashPatterns: null,
    isKernel: false,
  }

  it('calls deliverPackages(siteId, args.packages) strictly before the channel request', async () => {
    request.mockResolvedValue({ prompt: 'hi' })

    await promptPreview(SITE, { agent: AGENT_CONFIG, sessionType: 'chat', packages: PACKAGES })

    expectDeliveredBeforeRequest()
  })

  it('a deliverPackages rejection means no agent.promptPreview request is sent', async () => {
    const { PackageDeliveryError } = await vi.importActual<typeof import('../../packages/packageDelivery')>('../../packages/packageDelivery')
    mockDeliverPackages.mockRejectedValueOnce(new PackageDeliveryError('package_delivery_failed', 'nope'))

    await expect(
      promptPreview(SITE, { agent: AGENT_CONFIG, sessionType: 'chat', packages: PACKAGES }),
    ).rejects.toBeInstanceOf(PackageDeliveryError)
    expect(request).not.toHaveBeenCalled()
  })
})
