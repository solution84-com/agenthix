/**
 * used_memory costs no model step (memory and knowledge spec, What decides a recall: the lead marks the keys it
 * used): a step that ends the reply's words with only this call ends the turn there.
 */
import { describe, it, expect } from 'vitest'
import { runTurn } from '../../coordinator/turn'
import { harness, scriptedModel, usage } from '../../coordinator/__tests__/turnHarness'

const used = { status: 'done' as const, operationId: 'turn-1', result: { noted: true } }

describe('a turn that marks what it used @SC-989', () => {
  it('ends after the step that wrote its reply and called only used_memory, without asking the model again', async () => {
    const model = scriptedModel([
      [{ type: 'text', text: 'Black, no sugar.' }, { type: 'tool-call', call: { id: 'c1', name: 'used_memory', input: { keys: ['coffee'] } } }, { type: 'finish', reason: 'tool-calls', usage: usage(2) }],
    ])
    const h = harness(model, { used_memory: used })
    const outcome = await runTurn(h.deps, h.run().running)
    expect(outcome.state).toBe('COMPLETED')
    expect(model.requests).toHaveLength(1)
    expect(h.toolCall).toHaveBeenCalledTimes(1)
    expect(h.stored.map(m => m.body)).toEqual([{ text: 'Black, no sugar.' }])
  })

  it('goes on when used_memory came with no words yet, or with another call', async () => {
    const model = scriptedModel([
      [{ type: 'tool-call', call: { id: 'c1', name: 'used_memory', input: { keys: [] } } }, { type: 'finish', reason: 'tool-calls', usage: usage(1) }],
      [{ type: 'text', text: 'Done.' }, { type: 'tool-call', call: { id: 'c2', name: 'used_memory', input: { keys: [] } } }, { type: 'tool-call', call: { id: 'c3', name: 'list_tasks', input: {} } }, { type: 'finish', reason: 'tool-calls', usage: usage(1) }],
      [{ type: 'text', text: 'None open.' }, { type: 'finish', reason: 'stop', usage: usage(1) }],
    ])
    const h = harness(model, { used_memory: used, list_tasks: { status: 'done', operationId: 'op-1', result: { tasks: [] } } })
    await runTurn(h.deps, h.run().running)
    expect(model.requests).toHaveLength(3)
  })
})
