/**
 * The lead's own memory tools (memory and knowledge spec): recall by key and by query, memory only, recorded once as
 * recalled; remember and forget only for a turn that acts for someone;
 * used_memory recording used, unused and missed; a correction measured against what memory already held.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../memory/embedding/embedders', () => import('../../../test/fakes/embedders'))

import type { MemoryService, RecalledItem } from '../../../memory/contract'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'
import { ControlPlaneError } from '../../../server/controlplane/types'
import { createLeadMemoryTools, type LeadMemoryDeps } from '../leadMemoryTools'
import type { TurnOutcomeRow } from '../outcomes'

const item = (key: string, similarity?: number): RecalledItem => ({
  itemId: `id-${key}`, key, scope: 'AGENT_PLACE', title: key, body: `${key} body`, kind: 'FACT', tags: ['x'], pinned: false,
  writtenAt: '2026-10-01T00:00:00Z', ...(similarity !== undefined ? { similarity, score: similarity } : {}),
})

const principal = { personId: 'u1', agentId: 'agent-1', place: { type: 'user' as const, id: 'u1' } }

function setup(over: Partial<LeadMemoryDeps> = {}, outcomes: TurnOutcomeRow[] = []) {
  const service = {
    remember: vi.fn<MemoryService['remember']>(async () => ({ status: 'added', key: 'k', itemId: 'id-k' })),
    forget: vi.fn<MemoryService['forget']>(async () => true),
    recallByKey: vi.fn<MemoryService['recallByKey']>(async () => [item('staging')]),
    recallByQuery: vi.fn<MemoryService['recallByQuery']>(async () => ({ items: [item('staging', 0.7)], cut: ['older'] })),
    pinned: vi.fn<MemoryService['pinned']>(async () => []),
    recordOutcomes: vi.fn<MemoryService['recordOutcomes']>(async () => {}),
  }
  const deps = {
    service,
    principalOf: vi.fn(async () => principal),
    turnOutcomes: vi.fn(async () => outcomes),
    itemIdsByKey: vi.fn(async (_p: unknown, keys: readonly string[]) => keys.map(k => `id-${k}`)),
    nearest: vi.fn(async () => null as { itemId: string; similarity: number } | null),
    probableBar: vi.fn(async () => 0.45),
    probeScore: vi.fn(() => undefined as number | undefined),
    ...over,
  } satisfies LeadMemoryDeps
  const tools = Object.fromEntries(createLeadMemoryTools(deps).map(t => [t.name, t]))
  return { deps, service, tools }
}

const signal = new AbortController().signal
const turn = turnCapability()

describe('recall @SC-990', () => {
  it('by query returns the memory items only, and records each item recalled once @SC-1410', async () => {
    const { tools, service } = setup()
    const outcome = await tools.recall!.run(turn, { query: 'where do we deploy' }, { signal })
    expect(outcome.status).toBe('done')
    const result = (outcome as { result: Record<string, unknown> }).result
    expect(result.items).toEqual([{ key: 'staging', scope: 'agent_place', title: 'staging', body: 'staging body', kind: 'fact', tags: ['x'], pinned: false, writtenAt: '2026-10-01T00:00:00Z' }])
    expect(result.cut).toEqual(['older'])
    expect(result).not.toHaveProperty('knowledge')
    expect(service.recordOutcomes).toHaveBeenCalledTimes(1)
    expect(service.recordOutcomes).toHaveBeenCalledWith([{ itemId: 'id-staging', kind: 'RECALLED', similarity: 0.7, conversationId: 'conv-1', turnId: 'turn-1' }])
  })

  it('by key reads one item', async () => {
    const { tools } = setup()
    const outcome = await tools.recall!.run(turn, { key: 'staging' }, { signal })
    expect((outcome as { result: Record<string, unknown> }).result).not.toHaveProperty('knowledge')
  })

  it('takes a key or a query, one of the two', async () => {
    const { tools } = setup()
    expect(await tools.recall!.run(turn, { key: 'a', query: 'b' }, { signal })).toEqual({ status: 'refused', reason: 'recall takes a key or a query, one of the two' })
    expect((await tools.recall!.run(turn, {}, { signal })).status).toBe('refused')
  })

  it('is not offered to a report turn, and says a refusal in the rule\'s words', async () => {
    const { tools } = setup({ principalOf: vi.fn(async () => { throw new ControlPlaneError('forbidden', 'The person this work is for is no longer in the organisation') }) })
    expect(await tools.recall!.offered(turnCapability({ trigger: 'REPORT', actingUserId: null }))).toBe(false)
    expect(await tools.recall!.run(turn, { key: 'a' }, { signal })).toEqual({ status: 'refused', reason: 'The person this work is for is no longer in the organisation' })
  })
})

describe('remember and forget @SC-990', () => {
  it('write as the agent, for the turn\'s person, in the scope named', async () => {
    const { tools, service } = setup()
    const outcome = await tools.remember!.run(turn, { scope: 'person', title: 'Coffee order', body: 'Takes coffee black with no sugar.', kind: 'preference' }, { signal })
    expect(outcome).toEqual({ status: 'done', operationId: 'turn-1', result: { status: 'added', key: 'k', scope: 'person' } })
    expect(service.remember).toHaveBeenCalledWith(principal, expect.objectContaining({ scope: 'PERSON', kind: 'PREFERENCE', writtenBy: { agentId: 'agent-1' } }))
    expect(await tools.forget!.run(turn, { key: 'k', scope: 'agent_place' }, { signal })).toMatchObject({ result: { forgotten: true } })
    expect(service.forget).toHaveBeenCalledWith(principal, 'k', 'AGENT_PLACE')
  })

  it('are not offered, and refuse, when the turn acts for no one', async () => {
    const { tools, service } = setup()
    const noOne = turnCapability({ actingUserId: null, readerUserId: 'u1' })
    expect(await tools.remember!.offered(noOne)).toBe(false)
    expect(await tools.forget!.offered(noOne)).toBe(false)
    expect((await tools.remember!.run(noOne, { scope: 'person', title: 'a', body: 'b c d e', kind: 'fact' }, { signal })).status).toBe('refused')
    expect(service.remember).not.toHaveBeenCalled()
  })

  it('passes the store\'s refusal on in its words', async () => {
    const { tools, service } = setup()
    service.remember.mockResolvedValueOnce({ status: 'refused', reason: 'Say what "that" is' })
    expect(await tools.remember!.run(turn, { scope: 'person', title: 'That', body: 'do that', kind: 'fact' }, { signal })).toEqual({ status: 'refused', reason: 'Say what "that" is' })
  })

  it('records a miss on what memory already held when the lead remembers a correction it was not shown', async () => {
    const { tools, service } = setup({ nearest: vi.fn(async () => ({ itemId: 'id-old', similarity: 0.7 })), probeScore: vi.fn(() => 0.3) })
    await tools.remember!.run(turn, { scope: 'person', title: 'Report format', body: 'Wants reports as a table, never prose.', kind: 'feedback', correction: true }, { signal })
    expect(service.recordOutcomes).toHaveBeenCalledWith([{ itemId: 'id-old', kind: 'MISSED', similarity: 0.3, conversationId: 'conv-1', turnId: 'turn-1' }])
  })

  it('records no miss when the correction is not marked as one', async () => {
    const { tools, service, deps } = setup({ nearest: vi.fn(async () => ({ itemId: 'id-old', similarity: 0.7 })) })
    await tools.remember!.run(turn, { scope: 'person', title: 'Report format', body: 'Wants reports as a table, never prose.', kind: 'feedback' }, { signal })
    expect(deps.nearest).not.toHaveBeenCalled()
    expect(service.recordOutcomes).not.toHaveBeenCalled()
  })
})

describe('used_memory @SC-990', () => {
  it('records the named items used, the rest shown unused, and an item found on its own below the bar missed', async () => {
    const shown: TurnOutcomeRow[] = [
      { itemId: 'id-coffee', kind: 'INCLUDED' },
      { itemId: 'id-sign-off', kind: 'INCLUDED' },
      { itemId: 'id-staging', kind: 'RECALLED' },
    ]
    const { tools, service } = setup({ probeScore: vi.fn((_t: string, id: string) => (id === 'id-staging' ? 0.33 : undefined)) }, shown)
    expect(await tools.used_memory!.run(turn, { keys: ['coffee', 'staging'] }, { signal })).toEqual({ status: 'done', operationId: 'turn-1', result: { noted: true } })
    const recorded = service.recordOutcomes.mock.calls[0]![0]
    const ids = { conversationId: 'conv-1', turnId: 'turn-1' }
    expect(recorded).toEqual(expect.arrayContaining([
      { itemId: 'id-coffee', kind: 'USED', ...ids },
      { itemId: 'id-staging', kind: 'USED', ...ids },
      { itemId: 'id-staging', kind: 'MISSED', similarity: 0.33, ...ids },
      { itemId: 'id-sign-off', kind: 'UNUSED', ...ids },
    ]))
    expect(recorded).toHaveLength(4)
  })
})
