/**
 * The lead's own memory tools (memory and knowledge spec): recall by key and by query, memory only, recorded once as
 * recalled, narrowed or listed by kind and tags; remember and forget only for a turn that acts for someone, with no
 * scope chosen by the caller and the deprecated arguments still read (ADR-0188);
 * used_memory recording used, unused and missed; a correction measured against what memory already held.
 */
import { z } from 'zod'
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../../memory/embedding/embedders', () => import('../../../test/fakes/embedders'))

import type { MemoryService, RecalledItem } from '../../../memory/contract'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'
import { ControlPlaneError } from '../../../server/controlplane/types'
import { createLeadMemoryTools, type LeadMemoryDeps } from '../leadMemoryTools'
import type { TurnOutcomeRow } from '../outcomes'

const item = (key: string, similarity?: number): RecalledItem => ({
  itemId: `id-${key}`, key, title: key, body: `${key} body`, kind: 'FACT', tags: ['x'],
  writtenAt: '2026-10-01T00:00:00Z', ...(similarity !== undefined ? { similarity, score: similarity } : {}),
})

const principal = { personId: 'u1', agentId: 'agent-1', place: { type: 'user' as const, id: 'u1' } }

function setup(over: Partial<LeadMemoryDeps> = {}, outcomes: TurnOutcomeRow[] = []) {
  const service = {
    remember: vi.fn<MemoryService['remember']>(async () => ({ status: 'added', key: 'k', itemId: 'id-k' })),
    forget: vi.fn<MemoryService['forget']>(async () => true),
    recallByKey: vi.fn<MemoryService['recallByKey']>(async () => [item('staging')]),
    recallByQuery: vi.fn<MemoryService['recallByQuery']>(async () => ({ items: [item('staging', 0.7)], cut: ['older'] })),
    recallFiltered: vi.fn<MemoryService['recallFiltered']>(async () => ({ items: [{ ...item('tables'), kind: 'RULE' as const }], cut: [] })),
    recordOutcomes: vi.fn<MemoryService['recordOutcomes']>(async () => {}),
    setScope: vi.fn<MemoryService['setScope']>(async () => ({ status: 'unchanged', itemId: 'x' })),
    forgetOwn: vi.fn<MemoryService['forgetOwn']>(async () => true),
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
    expect(result.items).toEqual([{ key: 'staging', title: 'staging', body: 'staging body', kind: 'fact', tags: ['x'], writtenAt: '2026-10-01T00:00:00Z' }])
    expect(result.cut).toEqual(['older'])
    expect(result).not.toHaveProperty('knowledge')
    expect(service.recordOutcomes).toHaveBeenCalledTimes(1)
    expect(service.recordOutcomes).toHaveBeenCalledWith([{ itemId: 'id-staging', kind: 'RECALLED', similarity: 0.7, turnId: 'turn-1' }])
  })

  it('by key reads one item', async () => {
    const { tools } = setup()
    const outcome = await tools.recall!.run(turn, { key: 'staging' }, { signal })
    expect((outcome as { result: Record<string, unknown> }).result).not.toHaveProperty('knowledge')
  })

  it('takes a key, or a query and filters, not both', async () => {
    const { tools } = setup()
    expect(await tools.recall!.run(turn, { key: 'a', query: 'b' }, { signal })).toEqual({ status: 'refused', reason: 'recall takes a key, or a query and filters, not both' })
    expect((await tools.recall!.run(turn, { key: 'a', kind: 'rule' }, { signal })).status).toBe('refused')
    expect((await tools.recall!.run(turn, {}, { signal })).status).toBe('refused')
  })

  it('narrows a query by kind and tags, and lists by them alone', async () => {
    const { tools, service } = setup()
    await tools.recall!.run(turn, { query: 'how to compare', kind: 'rule', tags: ['Writing'] }, { signal })
    expect(service.recallByQuery).toHaveBeenCalledWith(principal, 'how to compare', { kind: 'RULE', tags: ['writing'] })
    const listed = await tools.recall!.run(turn, { kind: 'rule' }, { signal })
    expect(service.recallFiltered).toHaveBeenCalledWith(principal, { kind: 'RULE', tags: undefined })
    expect((listed as { result: { items: { kind: string }[] } }).result.items.map(i => i.kind)).toEqual(['rule'])
  })

  it('tells a turn for no person that there is no memory here', async () => {
    const { tools, service } = setup({ principalOf: vi.fn(async () => ({ ...principal, personId: null })) })
    expect(await tools.recall!.run(turn, { query: 'anything' }, { signal })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/not for any person/) })
    expect(await tools.remember!.run(turn, { title: 'Coffee order', body: 'Takes coffee black with no sugar.', kind: 'fact' }, { signal })).toMatchObject({ status: 'refused' })
    expect(service.recallByQuery).not.toHaveBeenCalled()
    expect(service.remember).not.toHaveBeenCalled()
  })

  it('is not offered to a report turn, and says a refusal in the rule\'s words', async () => {
    const { tools } = setup({ principalOf: vi.fn(async () => { throw new ControlPlaneError('forbidden', 'The person this work is for is no longer in the organisation') }) })
    expect(await tools.recall!.offered(turnCapability({ trigger: 'REPORT', actingUserId: null }))).toBe(false)
    expect(await tools.recall!.run(turn, { key: 'a' }, { signal })).toEqual({ status: 'refused', reason: 'The person this work is for is no longer in the organisation' })
  })
})

describe('remember and forget @SC-990', () => {
  it('write for the turn\'s person, with no scope from the caller, and say whether the person asked', async () => {
    const { tools, service } = setup()
    const outcome = await tools.remember!.run(turn, { title: 'Comparing options', body: 'When comparing options, use a table.', kind: 'rule', requested: true }, { signal })
    expect(outcome).toEqual({ status: 'done', operationId: 'turn-1', result: { status: 'added', key: 'k', itemId: 'id-k', requested: true } })
    expect(service.remember).toHaveBeenCalledWith(principal, { title: 'Comparing options', body: 'When comparing options, use a table.', kind: 'RULE', tags: undefined, key: undefined, requested: true, conversationId: turn.conversationId })
    expect(await tools.forget!.run(turn, { key: 'k' }, { signal })).toMatchObject({ result: { forgotten: true } })
    expect(service.forget).toHaveBeenCalledWith(principal, 'k')
  })

  it('still read the deprecated scope and kinds: the scope ignored, the old kinds as a Rule or a Fact', async () => {
    const { tools, service } = setup()
    for (const [kind, as] of [['preference', 'RULE'], ['decision', 'RULE'], ['feedback', 'RULE'], ['project', 'FACT'], ['fact', 'FACT']] as const) {
      const outcome = await tools.remember!.run(turn, { scope: 'agent_place', title: 'Deploys', body: 'The person deploys on Fridays.', kind }, { signal })
      expect(outcome.status, kind).toBe('done')
      expect(service.remember).toHaveBeenLastCalledWith(principal, expect.objectContaining({ kind: as }))
      expect(service.remember.mock.lastCall![1]).not.toHaveProperty('scope')
    }
    expect(await tools.forget!.run(turn, { key: 'k', scope: 'person' }, { signal })).toMatchObject({ result: { forgotten: true } })
    expect(service.forget).toHaveBeenLastCalledWith(principal, 'k')
  })

  it('need only a title and a body: a memory with no kind is a fact, and only rule and fact are offered', async () => {
    const { tools, service } = setup()
    const outcome = await tools.remember!.run(turn, { title: 'Deploys', body: 'The person deploys on Fridays.' }, { signal })
    expect(outcome.status).toBe('done')
    expect(service.remember).toHaveBeenLastCalledWith(principal, expect.objectContaining({ kind: 'FACT' }))
    const schema = z.toJSONSchema(tools.remember!.input, { io: 'input' }) as { required: string[]; properties: Record<string, unknown> }
    expect(schema.required.sort()).toEqual(['body', 'title'])
    expect(JSON.stringify(schema.properties.kind)).not.toMatch(/preference|decision|feedback|project/)
    expect(schema.properties).not.toHaveProperty('scope')
  })

  it('mark a memory saved on the agent\'s own as not requested, and a correction as requested', async () => {
    const { tools } = setup()
    const own = await tools.remember!.run(turn, { title: 'Job', body: 'Avery is looking for a new job.', kind: 'fact' }, { signal })
    expect((own as { result: { requested: boolean } }).result.requested).toBe(false)
    const corrected = await tools.remember!.run(turn, { title: 'Job', body: 'Avery is looking for a new job.', kind: 'fact', correction: true }, { signal })
    expect((corrected as { result: { requested: boolean } }).result.requested).toBe(true)
  })

  it('are not offered, and refuse, when the turn acts for no one', async () => {
    const { tools, service } = setup()
    const noOne = turnCapability({ actingUserId: null, readerUserId: 'u1' })
    expect(await tools.remember!.offered(noOne)).toBe(false)
    expect(await tools.forget!.offered(noOne)).toBe(false)
    expect((await tools.remember!.run(noOne, { title: 'a', body: 'b c d e', kind: 'fact' }, { signal })).status).toBe('refused')
    expect(service.remember).not.toHaveBeenCalled()
  })

  it('passes the store\'s refusal on in its words', async () => {
    const { tools, service } = setup()
    service.remember.mockResolvedValueOnce({ status: 'refused', reason: 'Say what "that" is' })
    expect(await tools.remember!.run(turn, { title: 'That', body: 'do that', kind: 'fact' }, { signal })).toEqual({ status: 'refused', reason: 'Say what "that" is' })
  })

  it('records a miss on what memory already held when the lead remembers a correction it was not shown', async () => {
    const { tools, service } = setup({ nearest: vi.fn(async () => ({ itemId: 'id-old', similarity: 0.7 })), probeScore: vi.fn(() => 0.3) })
    await tools.remember!.run(turn, { title: 'Report format', body: 'Wants reports as a table, never prose.', kind: 'rule', correction: true }, { signal })
    expect(service.recordOutcomes).toHaveBeenCalledWith([{ itemId: 'id-old', kind: 'MISSED', similarity: 0.3, turnId: 'turn-1' }])
  })

  it('records no miss when the correction is not marked as one', async () => {
    const { tools, service, deps } = setup({ nearest: vi.fn(async () => ({ itemId: 'id-old', similarity: 0.7 })) })
    await tools.remember!.run(turn, { title: 'Report format', body: 'Wants reports as a table, never prose.', kind: 'rule' }, { signal })
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
    const ids = { turnId: 'turn-1' }
    expect(recorded).toEqual(expect.arrayContaining([
      { itemId: 'id-coffee', kind: 'USED', ...ids },
      { itemId: 'id-staging', kind: 'USED', ...ids },
      { itemId: 'id-staging', kind: 'MISSED', similarity: 0.33, ...ids },
      { itemId: 'id-sign-off', kind: 'UNUSED', ...ids },
    ]))
    expect(recorded).toHaveLength(4)
  })
})
