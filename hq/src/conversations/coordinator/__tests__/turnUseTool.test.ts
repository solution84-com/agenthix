/**
 * A use_tool call in a turn (ADR-0193): the turn runs the tool it names, so its steps, lines and records name that
 * tool, and the model is answered under use_tool; the instructions are built with the areas of what is folded.
 */
import { describe, it, expect, vi } from 'vitest'
import { runTurn } from '../turn'
import { claimed, harness, scriptedModel, usage } from './turnHarness'

describe('a use_tool call in a turn @SC-2175', () => {
  it('runs the tool it names, and its result goes back to the model under use_tool', async () => {
    const asked = { id: 'c1', name: 'use_tool', input: { name: 'list_boards', input: { projectId: 'WEB' } } }
    const model = scriptedModel([
      [{ type: 'tool-call', call: asked }, { type: 'finish', reason: 'tool-calls', usage: usage(2) }],
      [{ type: 'text', text: 'WEB has two boards.' }, { type: 'finish', reason: 'stop', usage: usage(3) }],
    ])
    const h = harness(model, { list_boards: { status: 'done', operationId: 'turn-1', result: { boards: [] } } })

    await runTurn(h.deps, h.run().running)

    expect(h.toolCall).toHaveBeenCalledWith(
      expect.anything(), { id: 'c1', name: 'list_boards', input: { projectId: 'WEB' }, via: 'use_tool' }, expect.anything(),
    )
    expect(model.requests[1]!.messages.slice(-2)).toEqual([
      { role: 'assistant', content: '', toolCalls: [asked] },
      { role: 'tool', toolCallId: 'c1', toolName: 'use_tool', result: { boards: [] } },
    ])
  })

  it("builds the instructions with the turn's folded tools", async () => {
    const model = scriptedModel([[{ type: 'text', text: 'Hi.' }, { type: 'finish', reason: 'stop', usage: usage(1) }]])
    const h = harness(model)
    h.deps.tools.foldedFor = vi.fn(async () => [{ name: 'plan_task', area: 'planning' as const }])

    await runTurn(h.deps, h.run(claimed()).running)

    expect(h.deps.context).toHaveBeenCalledWith(expect.anything(), 'agent-1', expect.anything(), [{ name: 'plan_task', area: 'planning' }])
  })
})
