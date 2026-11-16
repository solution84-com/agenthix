/**
 * The lean task editors (lean agent context spec, §2): a conversation is offered update_task with the fields it
 * changes and plan_task with the planning ones, in place of the control plane's full update_task. Both run update_task
 * through the adapter's one path: its permission, its Ask, its row and its call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { ToolCallOutcome, TurnCapability } from '../../contract'
import type { AskInput } from '../../work/toolCalls/ask'
import { createToolAdapter, leadToolOffer } from '../toolAdapter'
import { conversationTools } from '../../work/registry'
import type { ToolOperationRows } from '../operationRows'
import { LEAN_UPDATE_FIELDS, PLAN_FIELDS, picked } from '../leanTaskTools'
import { CONTROL_PLANE_TOOLS } from '../../../server/controlplane/toolSchemas'
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

const admitted: { toolName: string }[] = []
const rows: ToolOperationRows = {
  async admit(input) { admitted.push({ toolName: input.toolName }); return { operationId: `op-${admitted.length}`, alreadyRunning: false } },
  async promote() {},
  async settle() {},
}
let call: ReturnType<typeof vi.fn<(name: string, capability: TurnCapability, args: unknown) => Promise<unknown>>>
let ask: ReturnType<typeof vi.fn<(input: AskInput) => Promise<ToolCallOutcome>>>
let adapter: ReturnType<typeof createToolAdapter>
const options = () => ({ waitLimitMs: 50, signal: new AbortController().signal, mailbox: { operationSettled: () => {} } })
const offerOf = (c: TurnCapability) => leadToolOffer(c, conversationTools())
const keysOf = (input: z.ZodType) => Object.keys((z.toJSONSchema(input) as { properties: object }).properties).sort()

beforeEach(() => {
  admitted.length = 0
  call = vi.fn(async () => ({ updated: true }))
  ask = vi.fn(async () => ({ status: 'waitingApproval' as const, operationId: 'asked-1' }))
  adapter = createToolAdapter({ rows, call, ask, settle: async () => true, logError: () => {} })
})

describe('the lean task editors @SC-2177', () => {
  it('pick every field they name from the control plane\'s update_task', () => {
    const declared = Object.keys(CONTROL_PLANE_TOOLS.find(t => t.name === 'update_task')!.schema)
    for (const field of [...LEAN_UPDATE_FIELDS, ...PLAN_FIELDS]) expect(declared).toContain(field)
    expect(Object.keys(picked('update_task', ['title', 'notAField']))).toEqual(['title'])
  })

  it('offer update_task with the fields a conversation changes, and plan_task with the planning ones', async () => {
    const tools = await offerOf(turnCapability())
    expect(tools.filter(t => t.name === 'update_task')).toHaveLength(1)
    expect(keysOf(tools.find(t => t.name === 'update_task')!.input)).toEqual([...LEAN_UPDATE_FIELDS].sort())
    expect(keysOf(tools.find(t => t.name === 'plan_task')!.input)).toEqual([...PLAN_FIELDS].sort())
  })

  it('run update_task for plan_task, its row and its call named update_task', async () => {
    const outcome = await adapter.call(turnCapability(), { id: 'c1', name: 'plan_task', input: { taskId: 't1', priority: 'high', labels: ['bug'] } }, options())
    expect(outcome.status).toBe('done')
    expect(call).toHaveBeenCalledWith('update_task', expect.anything(), { taskId: 't1', priority: 'high', labels: ['bug'] })
    expect(admitted).toEqual([{ toolName: 'update_task' }])
  })

  it('pass on only their own fields: a planning field sent to update_task is dropped', async () => {
    await adapter.call(turnCapability(), { id: 'c1', name: 'update_task', input: { taskId: 't1', state: 'DONE', priority: 'high' } }, options())
    expect(call).toHaveBeenCalledWith('update_task', expect.anything(), { taskId: 't1', state: 'DONE' })
  })

  it("take update_task's permission: at Ask both are offered with a reason and ask as update_task; at Never neither", async () => {
    const asking = turnCapability({ permissions: { bypassed: false, allowedTools: [{ name: 'update_task', state: 'ask' }], allowedBashPatterns: [], neverTools: [] } })
    const tools = await offerOf(asking)
    for (const name of ['update_task', 'plan_task']) expect(tools.find(t => t.name === name)!.description).toMatch(/approval first/)
    await adapter.call(asking, { id: 'c1', name: 'plan_task', input: { taskId: 't1', priority: 'low', reason: 'as asked' } }, options())
    expect(ask).toHaveBeenCalledExactlyOnceWith({ capability: asking, toolName: 'update_task', args: { taskId: 't1', priority: 'low' }, reason: 'as asked' })

    const never = turnCapability({ permissions: { bypassed: false, allowedTools: [{ name: 'update_task', state: 'never' }], allowedBashPatterns: [], neverTools: ['update_task'] } })
    const names = (await offerOf(never)).map(t => t.name)
    expect(names).not.toContain('update_task')
    expect(names).not.toContain('plan_task')
    expect((await adapter.call(never, { id: 'c2', name: 'plan_task', input: { taskId: 't1' } }, options())).status).toBe('refused')
    expect(call).not.toHaveBeenCalled()
  })
})
