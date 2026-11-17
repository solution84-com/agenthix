/**
 * The tool search in a conversation's reply (ADR-0193; lean agent context spec, §4–§6): a turn is shown its must-haves
 * and find_tools and use_tool; find_tools searches the rest it may use, and use_tool runs one through the path a
 * native call takes — its validation, Ask, Never, row and call — under that tool's name. Rows are an in-memory
 * stand-in; the search is by words alone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CONVERSATION_MUST_HAVES, type FindToolsAnswer } from '@agenthix/core'
import type { ToolCallOutcome, TurnCapability } from '../../contract'
import type { AskInput } from '../../work/toolCalls/ask'
import { createToolAdapter } from '../toolAdapter'
import { calledName, unwrapUseTool } from '../foldedTools'
import type { ToolOperationRows } from '../operationRows'
import type { ActionWriter } from '../actionLines'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'

// The conversation's own tools read the database; each is tested beside its own code.
vi.mock('../../work/workers', () => ({ workerTools: [], workerOwner: {} }))
vi.mock('../../work/toolCalls', () => ({ toolCallTools: [], toolCallOwner: {} }))
vi.mock('../../memory', () => ({ memoryTools: [] }))
vi.mock('../../memory/leadKnowledgeTools', () => ({ knowledgeTools: [] }))
vi.mock('../../placesSuggest', () => ({ placeTools: [] }))
vi.mock('../../long/ledgerTool', () => ({ ledgerTool: { name: 'ledger', offered: async () => false } }))
vi.mock('../../long/zoom', () => ({ zoomTools: [] }))
vi.mock('../../coordinator/keepListening', async importOriginal => ({
  ...(await importOriginal<typeof import('../../coordinator/keepListening')>()), keepListeningTool: { name: 'keep_listening', offered: async () => false },
}))

const admitted: string[] = []
const rows: ToolOperationRows = {
  async admit(input) { admitted.push(input.toolName); return { operationId: `op-${admitted.length}`, alreadyRunning: false } },
  async promote() {},
  async settle() {},
}
let call: ReturnType<typeof vi.fn<(name: string, capability: TurnCapability, args: unknown) => Promise<unknown>>>
let ask: ReturnType<typeof vi.fn<(input: AskInput) => Promise<ToolCallOutcome>>>
let write: ReturnType<typeof vi.fn<ActionWriter['write']>>
let adapter: ReturnType<typeof createToolAdapter>
const options = () => ({ waitLimitMs: 50, signal: new AbortController().signal, mailbox: { operationSettled: () => {} } })
const permissions = (tools: { name: string; state: 'always' | 'ask' | 'never' }[]) => ({
  bypassed: false, allowedTools: tools, allowedBashPatterns: [], neverTools: tools.filter(t => t.state === 'never').map(t => t.name),
})
const useTool = (name: string, input: unknown, extra: Record<string, unknown> = {}) => ({ id: 'c1', name: 'use_tool', input: { name, input, ...extra } })
const find = async (capability: TurnCapability, query: string) => {
  const outcome = await adapter.call(capability, { id: 'f1', name: 'find_tools', input: { query } }, options())
  return (outcome as { result: FindToolsAnswer }).result
}

beforeEach(() => {
  admitted.length = 0
  call = vi.fn(async () => ({ success: true }))
  ask = vi.fn(async () => ({ status: 'waitingApproval' as const, operationId: 'asked-1' }))
  write = vi.fn<ActionWriter['write']>(async () => {})
  adapter = createToolAdapter({
    rows, call, ask, settle: async () => true, logError: () => {}, search: { embedder: null },
    actions: { write, before: async () => null },
  })
})

describe('what a turn is shown @SC-2171', () => {
  it('is its must-haves and the two search tools; the rest is found by search', async () => {
    const names = (await adapter.toolsFor(turnCapability())).map(t => t.name)
    for (const name of names) expect(CONVERSATION_MUST_HAVES).toContain(name)
    expect(names).toEqual(expect.arrayContaining(['list_tasks', 'update_task', 'find_tools', 'use_tool']))
    for (const folded of ['add_comment', 'plan_task', 'list_boards', 'list_milestones']) expect(names).not.toContain(folded)
  })

  it('names what is folded, each with its area', async () => {
    const folded = await adapter.foldedFor!(turnCapability())
    expect(folded).toEqual(expect.arrayContaining([{ name: 'plan_task', area: 'planning' }, { name: 'add_comment', area: 'tasks' }]))
    expect(new Set(folded.map(t => t.name)).size).toBe(folded.length)
  })

  it('is nothing for a report turn', async () => {
    expect(await adapter.toolsFor(turnCapability({ trigger: 'REPORT' }))).toEqual([])
  })
})

describe('find_tools @SC-2173', () => {
  it('finds a folded tool with its full description and input, and only reads', async () => {
    const answer = await find(turnCapability(), 'comment on a task')
    expect(answer.tools[0]).toMatchObject({ name: 'add_comment', input: { properties: { taskId: expect.anything(), content: expect.anything() } } })
    expect(adapter.readsOnly!(turnCapability(), { id: 'f1', name: 'find_tools', input: {} })).toBe(true)
    expect(call).not.toHaveBeenCalled()
  })

  it('never finds a tool at Never, and finds one at Ask with its reason', async () => {
    const never = turnCapability({ permissions: permissions([{ name: 'add_comment', state: 'never' }]) })
    expect((await find(never, 'comment on a task')).tools.map(t => t.name)).not.toContain('add_comment')
    const asking = turnCapability({ permissions: permissions([{ name: 'add_comment', state: 'ask' }]) })
    const found = (await find(asking, 'comment on a task')).tools.find(t => t.name === 'add_comment')!
    expect(found.description).toMatch(/approval first/)
    expect(found.input).toMatchObject({ properties: { reason: expect.anything() }, required: expect.arrayContaining(['reason']) })
  })

  it('says so in one line, sending the agent back to the names it was given, when nothing matches', async () => {
    const answer = await find(turnCapability(), 'order a pizza')
    expect(answer.tools).toEqual([])
    expect(answer.note).toMatch(/^No tool you may use matches that: .*named in your instructions.*do not search again: tell the person you can't do it here/)
  })
})

describe('use_tool @SC-2175', () => {
  it('runs the named tool through its own path, its row, call and action line under its name', async () => {
    const outcome = await adapter.call(turnCapability(), useTool('add_comment', { taskId: 't1', content: 'Approved' }), options())
    expect(outcome.status).toBe('done')
    expect(admitted).toEqual(['add_comment'])
    expect(call).toHaveBeenCalledWith('add_comment', expect.anything(), { taskId: 't1', content: 'Approved' })
    expect(write).toHaveBeenCalledWith(expect.anything(), 'add_comment', expect.anything(), expect.anything(), null)
  })

  it("runs a lean tool as the tool it runs: plan_task's row is update_task's", async () => {
    await adapter.call(turnCapability(), useTool('plan_task', { taskId: 't1', milestoneId: 'm1' }), options())
    expect(admitted).toEqual(['update_task'])
    expect(call).toHaveBeenCalledWith('update_task', expect.anything(), { taskId: 't1', milestoneId: 'm1' })
  })

  it("refuses input that doesn't fit the tool with its definition @SC-2176, so it can be called again without a search", async () => {
    for (const input of [{ taskId: 't1' }, undefined]) {
      const outcome = await adapter.call(turnCapability(), useTool('add_comment', input), options())
      expect(outcome).toMatchObject({ status: 'refused', reason: expect.stringMatching(/^The input does not fit add_comment: .*content.*Its input: \{.*"content".*Call use_tool again/) })
    }
    expect(call).not.toHaveBeenCalled()
  })

  it('refuses a tool at Never, an unknown one and the search tools themselves, saying to search @SC-2176', async () => {
    const never = turnCapability({ permissions: permissions([{ name: 'add_comment', state: 'never' }]) })
    for (const [capability, name] of [[never, 'add_comment'], [turnCapability(), 'drop_database'], [turnCapability(), 'use_tool'], [turnCapability(), 'find_tools']] as const) {
      const outcome = await adapter.call(capability, useTool(name, {}), options())
      expect(outcome).toEqual({ status: 'refused', reason: `${name} is not a tool you can use here. Search with find_tools for one that does what you want.` })
    }
    expect(call).not.toHaveBeenCalled()
  })

  it('waits for a person at Ask, under the named tool, taking the reason in its input or beside it', async () => {
    const asking = turnCapability({ permissions: permissions([{ name: 'add_comment', state: 'ask' }]) })
    await adapter.call(asking, useTool('add_comment', { taskId: 't1', content: 'Approved', reason: 'as asked' }), options())
    await adapter.call(asking, useTool('add_comment', { taskId: 't1', content: 'Again' }, { reason: 'beside it' }), options())
    expect(ask.mock.calls.map(([input]) => [input.toolName, input.reason])).toEqual([['add_comment', 'as asked'], ['add_comment', 'beside it']])
    expect(call).not.toHaveBeenCalled()
  })

  it('reads as the tool it names: a read tool runs beside others', () => {
    expect(adapter.readsOnly!(turnCapability(), useTool('list_boards', { projectId: 'p1' }))).toBe(true)
    expect(adapter.readsOnly!(turnCapability(), useTool('add_comment', {}))).toBe(false)
  })
})

describe('a use_tool call in a turn @SC-2175', () => {
  it('is the call of the tool it names, answered under use_tool', () => {
    const read = unwrapUseTool(useTool('list_boards', { projectId: 'p1' }))
    expect(read).toEqual({ id: 'c1', name: 'list_boards', input: { projectId: 'p1' }, via: 'use_tool' })
    expect(calledName(read)).toBe('use_tool')
    const plain = { id: 'c2', name: 'list_tasks', input: {} }
    expect(unwrapUseTool(plain)).toBe(plain)
    expect(calledName(plain)).toBe('list_tasks')
  })

  it('reads the named tool\'s input when it is sent as JSON text, and the reason beside it', () => {
    const read = unwrapUseTool(useTool('list_boards', '{"projectId":"p1"}', { reason: 'to look' }))
    expect(read.input).toEqual({ projectId: 'p1', reason: 'to look' })
  })

  it('keeps input that is neither an object nor JSON text for one, so it is never run as {}', () => {
    for (const bad of ['not json', '[1]', '"text"', 7, ['a']]) {
      expect(unwrapUseTool(useTool('list_boards', bad)).input).toBe(bad)
    }
    expect(unwrapUseTool(useTool('list_boards', undefined)).input).toEqual({})
  })

  it('runs a tool whose fields are all optional with the input sent as JSON text, and refuses input that is no object', async () => {
    await adapter.call(turnCapability(), useTool('add_comment', '{"taskId":"t1","content":"Approved"}'), options())
    expect(call).toHaveBeenCalledWith('add_comment', expect.anything(), { taskId: 't1', content: 'Approved' })
    call.mockClear()
    const outcome = await adapter.call(turnCapability(), useTool('add_comment', 'not json'), options())
    expect(outcome).toMatchObject({ status: 'refused', reason: expect.stringMatching(/^The input does not fit add_comment/) })
    expect(call).not.toHaveBeenCalled()
  })
})
