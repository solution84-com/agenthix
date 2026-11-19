/**
 * The recap of a reply that turns out not to be heard (adaptive voice listening, spec §The recap): withdrawn because the
 * person went on, or cut by them speaking over it, the reply keeps the last recap — the call stops, or once stored the
 * last one is put back, unless a later recap replaced it. The database is replaced: what is asked of it is the point.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  conversation: {
    findUnique: vi.fn(async () => ({ voiceRecap: 'The person asked about the launch.' })),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  conversationMessage: { findMany: vi.fn(async () => [{ body: { text: 'Who owns the rota?' } }]) },
  agent: { findUnique: vi.fn(async () => ({ name: 'Kernel' })) },
}))
vi.mock('wasp/server', () => ({ prisma: db }))
vi.mock('../../../sealing', () => ({ openJson: (body: unknown) => body }))
vi.mock('../../../../sessions/transcriptAuthors', () => ({ personName: vi.fn(async () => 'Sam') }))
vi.mock('../../../../billing/sources/hqCalls', () => ({ costedFor: (access: unknown) => access }))

import type { ConversationHomeRef, ResolvedAccess } from '../../../contract'
import { writeRecap, type RecapDeps } from '../recapCall'

const turn = { conversation: { id: 'c1', agentId: 'a1' } as ConversationHomeRef, actingUserId: 'u1', inputIds: ['m1'], agentText: 'Let me think.\n\nSam owns it.' }

function deps(complete: RecapDeps['model']['complete'] = async () => ({ text: 'Sam asked who owns the rota; it is Sam.', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } })): RecapDeps {
  return { model: { complete: vi.fn(complete) }, resolveAccess: vi.fn(async () => ({ access: {} as ResolvedAccess })) as unknown as RecapDeps['resolveAccess'], log: vi.fn() }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => vi.clearAllMocks())

describe('the recap of a reply that was not heard @SC-2217', () => {
  it('a heard reply stores its recap, and nothing is put back', async () => {
    const unheard = new AbortController()
    await writeRecap(turn, deps(), unheard.signal)
    expect(db.conversation.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { voiceRecap: 'Sam asked who owns the rota; it is Sam.' } })
    expect(db.conversation.updateMany).not.toHaveBeenCalled()
  })

  it('not heard before the call: no call, nothing stored', async () => {
    const unheard = new AbortController()
    unheard.abort()
    const d = deps()
    await writeRecap(turn, d, unheard.signal)
    expect(d.model.complete).not.toHaveBeenCalled()
    expect(db.conversation.update).not.toHaveBeenCalled()
  })

  it('not heard while the call runs: the call is stopped and nothing is stored', async () => {
    const unheard = new AbortController()
    const d = deps(async request => {
      unheard.abort()
      expect(request.signal?.aborted).toBe(true)
      throw new Error('aborted')
    })
    await expect(writeRecap(turn, d, unheard.signal)).rejects.toThrow('aborted')
    expect(db.conversation.update).not.toHaveBeenCalled()
  })

  it('not heard once stored: the last recap is put back, only if no later one replaced it', async () => {
    const unheard = new AbortController()
    await writeRecap(turn, deps(), unheard.signal)
    expect(db.conversation.update).toHaveBeenCalledTimes(1)
    unheard.abort()
    await flush()
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', voiceRecap: 'Sam asked who owns the rota; it is Sam.' }, data: { voiceRecap: 'The person asked about the launch.' },
    })
  })
})
