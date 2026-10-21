/**
 * A turn in a long conversation (long conversations spec): compaction only at its start, before the first model
 * call; the first three parts of the context the same bytes on every call of its tool loop, the window only
 * growing; the context's size taken from the last call; work it starts kept open in the ledger.
 */
import { describe, it, expect, vi } from 'vitest'
import type { LeadRequest, TurnUsage } from '../../contract'
import { runTurn } from '../turn'
import { claimed, harness, scriptedModel, usage } from './turnHarness'

const call = (id: string, name: string) => ({ type: 'tool-call' as const, call: { id, name, input: {} } })
const finish = (u: TurnUsage, reason: 'stop' | 'tool-calls' = 'stop') => ({ type: 'finish' as const, reason, usage: u })

function prefixOf(request: LeadRequest, length: number) {
  return JSON.stringify({ system: request.system, messages: request.messages.slice(0, length) })
}

describe('a turn in a long conversation', () => {
  it('sends the same system parts and an only-growing window on every call of its tool loop @SC-980', async () => {
    const model = scriptedModel([
      [call('c1', 'list_tasks'), finish(usage(1), 'tool-calls')],
      [call('c2', 'list_tasks'), finish(usage(1), 'tool-calls')],
      [{ type: 'text', text: 'Done' }, finish(usage(1))],
    ])
    const h = harness(model, { list_tasks: { status: 'done', operationId: 'op', result: [] } })
    const system = [{ text: 'instructions', cacheAfter: true }, { text: '# Earlier in this conversation', cacheAfter: true }]
    h.deps.context = vi.fn(async () => ({ system, messages: [{ role: 'user' as const, content: 'go' }], cacheAfterMessage: 0 }))

    await runTurn(h.deps, h.run().running)

    expect(model.requests).toHaveLength(3)
    const [first, second, third] = model.requests as [LeadRequest, LeadRequest, LeadRequest]
    expect(JSON.stringify(second.system)).toBe(JSON.stringify(first.system))
    expect(JSON.stringify(third.system)).toBe(JSON.stringify(first.system))
    expect(prefixOf(second, first.messages.length)).toBe(prefixOf(first, first.messages.length))
    expect(prefixOf(third, second.messages.length)).toBe(prefixOf(second, second.messages.length))
    expect(new Set(model.requests.map(r => r.cacheAfterMessage))).toEqual(new Set([0]))
    expect(h.deps.context).toHaveBeenCalledTimes(1)
  })

  it('compacts once, before the context is assembled and before any model call, and counts the summariser\'s usage @SC-979', async () => {
    const order: string[] = []
    const model = scriptedModel([
      [call('c1', 'list_tasks'), finish(usage(1), 'tool-calls')],
      [{ type: 'text', text: 'Done' }, finish(usage(2))],
    ])
    const h = harness(model, { list_tasks: { status: 'done', operationId: 'op', result: [] } })
    const context = h.deps.context
    h.deps.context = vi.fn(async (...args: Parameters<typeof context>) => { order.push('context'); return context(...args) })
    const summariser: TurnUsage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100, cacheWriteTokens: 0 }
    h.deps.compactAtStart = vi.fn(async () => { order.push('compact'); return summariser })

    await runTurn(h.deps, h.run(claimed()).running)

    expect(order).toEqual(['compact', 'context'])
    expect(h.deps.compactAtStart).toHaveBeenCalledTimes(1)
    expect(h.deps.compactAtStart).toHaveBeenCalledWith('conv-1', expect.objectContaining({ model: 'claude-sonnet-5' }), ['m1'], expect.any(AbortSignal))
    expect(h.ended[0]!.usage).toEqual({ inputTokens: 13, outputTokens: 8, cacheReadTokens: 100, cacheWriteTokens: 0 })
  })

  it('records the context\'s size as what its last model call sent @SC-980', async () => {
    const model = scriptedModel([
      [call('c1', 'list_tasks'), finish({ inputTokens: 50, outputTokens: 1, cacheReadTokens: 900, cacheWriteTokens: 0 }, 'tool-calls')],
      [{ type: 'text', text: 'Done' }, finish({ inputTokens: 20, outputTokens: 4, cacheReadTokens: 950, cacheWriteTokens: 30 })],
    ])
    const h = harness(model, { list_tasks: { status: 'done', operationId: 'op', result: [] } })
    await runTurn(h.deps, h.run().running)
    expect(h.ended[0]).toMatchObject({ contextTokens: 1_000 })
  })

  it('keeps work it started open in the ledger, at the message that shows it started @SC-981', async () => {
    const model = scriptedModel([
      [call('c1', 'start_work'), finish(usage(1), 'tool-calls')],
      [{ type: 'text', text: 'Started' }, finish(usage(1))],
    ])
    const h = harness(model, { start_work: { status: 'accepted', operationId: 'op-7' } }, { 'op-7': { title: 'Review the README', state: 'RUNNING', boundaryName: 'Shop', outstanding: 1 } })
    const record = vi.fn(async () => {})
    h.deps.ledger = { record }
    await runTurn(h.deps, h.run().running)
    const started = h.stored.find(m => m.kind === 'OPERATION_STARTED')!
    expect(record).toHaveBeenCalledWith('conv-1', { kind: 'open-operation', text: 'Review the README (in Shop)', operationId: 'op-7', sourceSeq: started.seq })
  })
})
