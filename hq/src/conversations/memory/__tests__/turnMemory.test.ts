/**
 * The probe's hook before a turn (memory and knowledge spec, What decides a recall): what the turn was shown is
 * recorded with the probe's similarity, included items count as read, a report turn gets no hint it cannot follow,
 * and a probe that fails leaves the turn to go on without memory.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../memory/embedding/embedders', () => import('../../../test/fakes/embedders'))

import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import type { RecalledItem } from '../../../memory/contract'
import { memoryForTurn, type TurnMemoryDeps, type TurnMemoryInput } from '../turnMemory'
import { probeScore } from '../probeScores'
import type { TurnProbe } from '../probe'

const item = (key: string, similarity?: number): RecalledItem => ({
  itemId: `id-${key}`, key, scope: 'PERSON', title: key, body: `${key} body`, kind: 'FACT', tags: [], pinned: false,
  writtenAt: '', ...(similarity !== undefined ? { similarity, score: similarity } : {}),
})

const found: TurnProbe = {
  certain: [item('coffee', 0.8)],
  probable: [{ itemId: 'id-staging', key: 'staging', title: 'Staging', similarity: 0.5 }],
  pinned: [{ ...item('sign-off'), pinned: true }],
  scores: new Map([['id-coffee', 0.8], ['id-staging', 0.5], ['id-far', 0.2]]),
}

const history = [{ id: 'm1', seq: 1, role: 'PERSON', kind: 'TEXT', body: { text: 'my usual?' }, turnId: null, queueState: null, operationId: null } as unknown as ConversationMessageView]

function input(trigger: 'MESSAGE' | 'REPORT' | 'CONTINUATION' = 'MESSAGE'): TurnMemoryInput {
  return {
    conversation: { id: 'c1', home: 'PERSON', projectId: null, taskId: null, openedById: 'u1', agentId: 'a1' },
    agentId: 'a1',
    turn: { turnId: `t-${trigger}`, trigger, actingUserId: trigger === 'REPORT' ? null : 'u1', inputIds: ['m1'] },
    history,
  }
}

function deps(over: Partial<TurnMemoryDeps> = {}) {
  return {
    principal: vi.fn(async () => ({ personId: 'u1', agentId: 'a1', place: { type: 'user' as const, id: 'u1' } })),
    title: vi.fn(async () => 'Orders'),
    probe: vi.fn(async () => found),
    recordOutcomes: vi.fn(async () => {}),
    markRecalled: vi.fn(async () => {}),
    now: () => new Date('2026-10-16T00:00:00Z'),
    timeLimitMs: 1_000,
    ...over,
  } satisfies TurnMemoryDeps
}

describe('memoryForTurn @SC-989', () => {
  it('probes with the composed query and gives the block, recording what was included and hinted', async () => {
    const d = deps()
    const block = await memoryForTurn(input(), d)
    expect(d.probe).toHaveBeenCalledWith({ personId: 'u1', agentId: 'a1', place: { type: 'user', id: 'u1' } }, 'my usual?\nOrders')
    expect(block).toMatch(/\[sign-off\]/)
    expect(block).toMatch(/\[coffee\] coffee: coffee body/)
    expect(block).toMatch(/Staging \[staging\]/)
    expect(d.recordOutcomes).toHaveBeenCalledWith([
      { itemId: 'id-coffee', kind: 'INCLUDED', similarity: 0.8, conversationId: 'c1', turnId: 't-MESSAGE' },
      { itemId: 'id-staging', kind: 'HINTED', similarity: 0.5, conversationId: 'c1', turnId: 't-MESSAGE' },
    ])
    expect(d.markRecalled).toHaveBeenCalledWith(['id-coffee'], expect.any(Date))
    expect(probeScore('t-MESSAGE', 'id-far')).toBe(0.2)
  })

  it('gives a report turn no hint and no request to mark, and records no hint for it', async () => {
    const d = deps()
    const block = await memoryForTurn(input('REPORT'), d)
    expect(block).not.toMatch(/staging/)
    expect(block).not.toMatch(/used_memory/)
    expect(d.recordOutcomes).toHaveBeenCalledWith([expect.objectContaining({ itemId: 'id-coffee', kind: 'INCLUDED' })])
  })

  it('goes on without memory when the probe fails', async () => {
    const d = deps({ probe: vi.fn(async () => { throw new Error('embedder down') }) })
    expect(await memoryForTurn(input(), d)).toBeNull()
    expect(d.recordOutcomes).not.toHaveBeenCalled()
  })

  it('does not keep a reply waiting on a slow probe, such as the model\'s first load', async () => {
    const d = deps({ probe: vi.fn(() => new Promise<TurnProbe>(() => {})), timeLimitMs: 10 })
    expect(await memoryForTurn(input(), d)).toBeNull()
    expect(d.recordOutcomes).not.toHaveBeenCalled()
  })
})
