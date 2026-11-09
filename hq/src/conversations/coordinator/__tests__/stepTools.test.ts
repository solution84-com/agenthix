/**
 * One step's tool calls (stepTools.ts): calls that only read run side by side; a call that writes, asks for
 * approval or starts work runs on its own, after the calls asked before it and before those asked after; every
 * result comes back in the order the model asked. The tool adapter is a stand-in that records when each call ran.
 */
import { describe, expect, it } from 'vitest'
import type { LeadToolCall, ToolAdapter, ToolCallOutcome } from '../../contract'
import { runStepTools, type StepToolsContext } from '../stepTools'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'

const READS = new Set(['list_projects', 'list_boards', 'list_tasks'])

/** Each call takes a tick; the log says when each started and ended. */
function adapter(readsOnly = true) {
  const log: string[] = []
  const tools: ToolAdapter = {
    async toolsFor() { return [] },
    async call(_c, call): Promise<ToolCallOutcome> {
      log.push(`start ${call.id}`)
      await new Promise(r => setTimeout(r, 1))
      log.push(`end ${call.id}`)
      return { status: 'done', operationId: `op-${call.id}`, result: call.id }
    },
    ...(readsOnly ? { readsOnly: (_c, call) => READS.has(call.name) } : {}),
  }
  return { tools, log }
}

function context(tools: ToolAdapter): StepToolsContext {
  return {
    tools, capability: turnCapability({ turnId: 'turn-1', actingUserId: 'u1' }), waitLimitMs: 4_000,
    signal: new AbortController().signal, mailbox: { operationSettled: () => {} }, now: () => new Date(0), log: () => {},
    hasOperationStarted: async () => true, operationLine: async () => null, started: async () => {}, waiting: async () => {},
  }
}

const call = (id: string, name: string): LeadToolCall => ({ id, name, input: { id } })

describe("one step's tool calls @SC-1838", () => {
  it('runs calls that only read side by side, each result in the order asked', async () => {
    const { tools, log } = adapter()
    const done = await runStepTools(context(tools), [call('a', 'list_projects'), call('b', 'list_boards'), call('c', 'list_tasks')])
    expect(log.slice(0, 3)).toEqual(['start a', 'start b', 'start c'])
    expect(done.map(d => (d.outcome as { result: unknown }).result)).toEqual(['a', 'b', 'c'])
  })

  it('runs a call that writes on its own: after the reads asked before it, before the ones asked after', async () => {
    const { tools, log } = adapter()
    const done = await runStepTools(context(tools), [
      call('a', 'list_projects'), call('b', 'list_boards'), call('w', 'create_task'), call('x', 'update_task'), call('c', 'list_tasks'),
    ])
    expect(log).toEqual(['start a', 'start b', 'end a', 'end b', 'start w', 'end w', 'start x', 'end x', 'start c', 'end c'])
    expect(done.map(d => d.call.id)).toEqual(['a', 'b', 'w', 'x', 'c'])
  })

  it('runs every call on its own when the adapter marks none as only reading', async () => {
    const { tools, log } = adapter(false)
    await runStepTools(context(tools), [call('a', 'list_projects'), call('b', 'list_boards')])
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b'])
  })

  it('runs the same call asked twice once, whatever it does', async () => {
    const { tools, log } = adapter()
    const twice = { id: 'w', name: 'create_task', input: { title: 'One' } }
    const done = await runStepTools(context(tools), [twice, { ...twice, id: 'w2' }])
    expect(log).toEqual(['start w', 'end w'])
    expect(done).toHaveLength(2)
  })
})
