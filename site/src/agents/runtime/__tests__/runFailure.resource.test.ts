/** A run that failed for lack of resources says so on its status frame and in its transcript. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RunContextPayload } from '@agenthix/core'

const h = vi.hoisted(() => ({
  prisma: { agentRun: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => ({ sessionId: 's1', taskId: 't1' })) } },
  status: vi.fn(),
  persist: vi.fn(async () => ({})),
  cause: vi.fn(),
}))
vi.mock('#db', () => ({ prisma: h.prisma }))
vi.mock('../SiteStreamEmitter', () => ({ siteStream: { status: h.status } }))
vi.mock('../runPersistence', () => ({ persistRunOutput: h.persist }))
vi.mock('../sessionTitleFrame', () => ({ currentTitlePatch: async () => null }))
vi.mock('../runResourceCause', () => ({ runResourceCause: h.cause }))

import { failRun } from '../runFailure'
import { createRunLaunchSink } from '../runCleanup'

const ctx = { agent: { id: 'a1', handle: 'kernel', defaultModel: 'm' } } as unknown as RunContextPayload
const options = { dispatchContext: ctx } as unknown as Parameters<typeof failRun>[2]

beforeEach(() => { vi.clearAllMocks() })

describe('a run that failed for lack of resources', () => {
  it('sends the cause and its limit on the status frame, and on the transcript row', async () => {
    h.cause.mockResolvedValue({ cause: 'memory', limit: 4 * 1024 ** 3 })
    const sink = createRunLaunchSink()
    sink.containerName = 'c1'
    await failRun('r1', { message: 'exited with code 137' }, options, ctx, sink)
    expect(h.cause).toHaveBeenCalledWith({ error: 'exited with code 137', containerName: 'c1', baseline: null })
    expect(h.status).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', resource: { cause: 'memory', limit: 4 * 1024 ** 3 } }))
    expect(h.persist).toHaveBeenCalledWith(expect.objectContaining({
      ending: { kind: 'failed', reason: expect.stringMatching(/^This run stopped: it ran out of memory/), resource: { cause: 'memory', limit: 4 * 1024 ** 3 } },
    }))
  })

  it('any other failure carries no cause', async () => {
    h.cause.mockResolvedValue(null)
    await failRun('r1', { message: '529 overloaded' }, options, ctx, createRunLaunchSink())
    expect(h.status.mock.calls[0][0]).not.toHaveProperty('resource')
    expect(h.persist).toHaveBeenCalledWith(expect.objectContaining({ ending: { kind: 'failed', reason: 'The model provider was overloaded.' } }))
  })

  it('a stopped run is not looked at', async () => {
    await failRun('r1', { name: 'AbortError', message: 'aborted' }, options, ctx, createRunLaunchSink())
    expect(h.cause).not.toHaveBeenCalled()
  })
})
