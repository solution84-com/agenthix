/**
 * The tool adapter (conversation layer spec, Tool execution contract): a call within the wait limit answers in
 * the turn; past it the same call is detached — started once, never again — and its late result is settled on its
 * own row, once. A tool at Ask is offered with a reason and its call waits for a person instead of running. The
 * operation rows are an in-memory stand-in here; the real rows are tested against the database in
 * operationRows.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RESULT_CAP_CHARS, RESULT_TOO_LARGE } from '../../../shared/conversations/protocol'
import { ControlPlaneError } from '../../../server/controlplane/types'
import type { MailboxSink, OperationEnd, ToolCallOutcome, TurnCapability } from '../../contract'
import type { AskInput } from '../../work/toolCalls/ask'
import { createToolAdapter } from '../toolAdapter'
import { idempotencyKey } from '../turnTools'
import type { AdmitToolCall, ToolCallSettlement, ToolOperationRows } from '../operationRows'
import { turnCapability } from '../../../server/controlplane/__tests__/turnFixtures'

// start_work reads the database to find the places it may offer; it is tested beside its own code.
vi.mock('../../work/workers', () => ({ workerTools: [], workerOwner: {} }))
// answer_approval and cancel_operation count what waits in the conversation; they are tested beside their own code.
vi.mock('../../work/toolCalls', () => ({ toolCallTools: [], toolCallOwner: {} }))
// The lead's own recall, remember, forget and used_memory read memory; they are tested beside their own code.
vi.mock('../../memory', () => ({ memoryTools: [] }))
// The lead's knowledge tools are tested beside their own code.
vi.mock('../../memory/leadKnowledgeTools', () => ({ knowledgeTools: [] }))
// suggest_place is tested beside its own code.
vi.mock('../../placesSuggest', () => ({ placeTools: [] }))
// The lead's ledger tool is tested beside its own code.
vi.mock('../../long/ledgerTool', () => ({ ledgerTool: { name: 'ledger', offered: async () => false } }))
// expand, messages and offer_new_conversation read the record; they are tested beside their own code.
vi.mock('../../long/zoom', () => ({ zoomTools: [] }))
// keep_listening reads the voice turn block's flag, and is tested beside its own code.
vi.mock('../../coordinator/keepListening', async importOriginal => ({
  ...(await importOriginal<typeof import('../../coordinator/keepListening')>()), keepListeningTool: { name: 'keep_listening', offered: async () => false },
}))

interface Row {
  id: string
  key: string
  state: 'RUNNING' | ToolCallSettlement['state'] | OperationEnd['state']
  promoted: boolean
  settlement?: ToolCallSettlement
  end?: OperationEnd
}

function memoryRows(): ToolOperationRows & { rows: Row[] } {
  const rows: Row[] = []
  return {
    rows,
    async admit({ idempotencyKey: key }: AdmitToolCall) {
      const pending = rows.find(r => r.key === key && r.state === 'RUNNING')
      if (pending) return { operationId: pending.id, alreadyRunning: true }
      const row: Row = { id: `op-${rows.length + 1}`, key, state: 'RUNNING', promoted: false }
      rows.push(row)
      return { operationId: row.id, alreadyRunning: false }
    },
    async promote(id) { rows.find(r => r.id === id)!.promoted = true },
    async settle(id, settlement) {
      const row = rows.find(r => r.id === id)!
      row.state = settlement.state
      row.settlement = settlement
    },
  }
}

/** An operation that answers when the test says so. */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const tick = () => new Promise(r => setTimeout(r, 0))

let rows: ReturnType<typeof memoryRows>
let call: ReturnType<typeof vi.fn<(name: string, capability: TurnCapability, args: unknown) => Promise<unknown>>>
let logError: ReturnType<typeof vi.fn<(message: string, err: unknown) => void>>
let mailbox: MailboxSink & { operationSettled: ReturnType<typeof vi.fn<MailboxSink['operationSettled']>> }
let ask: ReturnType<typeof vi.fn<(input: AskInput) => Promise<ToolCallOutcome>>>
let settle: ReturnType<typeof vi.fn<(id: string, end: OperationEnd) => Promise<boolean>>>
let adapter: ReturnType<typeof createToolAdapter>
const capability = turnCapability()

function options(waitLimitMs = 50, signal = new AbortController().signal) {
  return { waitLimitMs, signal, mailbox }
}

beforeEach(() => {
  rows = memoryRows()
  call = vi.fn(async () => ({ tasks: [] }))
  logError = vi.fn<(message: string, err: unknown) => void>()
  mailbox = { operationSettled: vi.fn<MailboxSink['operationSettled']>() }
  ask = vi.fn(async () => ({ status: 'waitingApproval' as const, operationId: 'asked-1' }))
  // As settleOperation: once, from a running row only.
  settle = vi.fn(async (id: string, end: OperationEnd) => {
    const row = rows.rows.find(r => r.id === id)!
    if (row.state !== 'RUNNING') return false
    row.state = end.state
    row.end = end
    return true
  })
  adapter = createToolAdapter({ rows, call, ask, settle, logError })
})

describe('a call that answers within the wait limit @SC-957', () => {
  it("is done in the turn, its row created first and completed at once, and the mailbox is not told", async () => {
    const outcome = await adapter.call(capability, { id: 'c1', name: 'list_tasks', input: { projectId: 'p1' } }, options())
    expect(outcome).toEqual({ status: 'done', operationId: 'op-1', result: { tasks: [] } })
    expect(rows.rows).toMatchObject([{ id: 'op-1', state: 'COMPLETED', promoted: false }])
    expect(call).toHaveBeenCalledWith('list_tasks', capability, { projectId: 'p1' })
    expect(mailbox.operationSettled).not.toHaveBeenCalled()
  })

  it('returns a result over the cap cut to fit, with the line telling the lead to brief a worker', async () => {
    call.mockResolvedValueOnce({ text: 'x'.repeat(RESULT_CAP_CHARS * 2) })
    const outcome = await adapter.call(capability, { id: 'c1', name: 'list_tasks', input: { projectId: 'p1' } }, options())
    expect(outcome.status).toBe('done')
    const result = (outcome as { result: unknown }).result as string
    expect(typeof result).toBe('string')
    expect(result.length).toBeLessThanOrEqual(RESULT_CAP_CHARS)
    expect(result.endsWith(`[${RESULT_TOO_LARGE}]`)).toBe(true)
    expect(rows.rows[0].settlement).toEqual({ state: 'COMPLETED', result })
  })

  it("is refused in the operation's own words when the operation refuses it, and leaves nothing running", async () => {
    call.mockRejectedValueOnce(new ControlPlaneError('forbidden', 'list_tasks requires membership of this project'))
    const outcome = await adapter.call(capability, { id: 'c1', name: 'list_tasks', input: { projectId: 'p1' } }, options())
    expect(outcome).toEqual({ status: 'refused', reason: 'list_tasks requires membership of this project' })
    expect(rows.rows).toMatchObject([{ state: 'FAILED' }])
  })

  it('is refused without the internal error when the operation fails unexpectedly, and the failure is logged', async () => {
    call.mockRejectedValueOnce(new Error('connection string postgres://secret'))
    const outcome = await adapter.call(capability, { id: 'c1', name: 'list_tasks', input: { projectId: 'p1' } }, options())
    expect(outcome).toEqual({ status: 'refused', reason: 'list_tasks failed' })
    expect(logError).toHaveBeenCalledOnce()
  })
})

describe('a call past the wait limit is detached, never restarted @SC-957', () => {
  it('returns accepted, carries on, and settles its late result on the same row, with its report turn', async () => {
    const slow = deferred<unknown>()
    call.mockReturnValueOnce(slow.promise)
    const outcome = await adapter.call(capability, { id: 'c1', name: 'update_task', input: { taskId: 't1', title: 'New' } }, options(10))
    expect(outcome).toEqual({ status: 'accepted', operationId: 'op-1' })
    expect(rows.rows).toMatchObject([{ id: 'op-1', state: 'RUNNING', promoted: true }])
    expect(settle).not.toHaveBeenCalled()

    slow.resolve({ success: true })
    await tick()
    await tick()
    expect(rows.rows).toHaveLength(1)
    expect(settle).toHaveBeenCalledExactlyOnceWith('op-1', { state: 'COMPLETED', result: { summary: '{"success":true}' } })
    expect(rows.rows[0]).toMatchObject({ id: 'op-1', state: 'COMPLETED' })
    expect(call).toHaveBeenCalledOnce()
  })

  it('an identical call while it runs is that call: the same id, and nothing starts again', async () => {
    const slow = deferred<unknown>()
    call.mockReturnValueOnce(slow.promise)
    const first = await adapter.call(capability, { id: 'c1', name: 'update_task', input: { taskId: 't1', title: 'New' } }, options(10))
    const again = await adapter.call(capability, { id: 'c2', name: 'update_task', input: { title: 'New', taskId: 't1' } }, options(10))
    expect(again).toEqual({ status: 'accepted', operationId: (first as { operationId: string }).operationId })
    expect(call).toHaveBeenCalledOnce()
    slow.resolve({ success: true })
  })

  it('a late refusal settles the row as failed, in its own words', async () => {
    const slow = deferred<unknown>()
    call.mockReturnValueOnce(slow.promise)
    await adapter.call(capability, { id: 'c1', name: 'list_tasks', input: { projectId: 'p1' } }, options(10))
    slow.reject(new ControlPlaneError('unavailable', 'The project\'s site is offline'))
    await tick()
    await tick()
    expect(settle).toHaveBeenCalledExactlyOnceWith('op-1', { state: 'FAILED', error: "The project's site is offline" })
  })

  it.each(['stop', 'interrupt'])('a turn a person cut (%s) while it waits detaches the call, which completes to a card with no report turn', async (reason) => {
    const slow = deferred<unknown>()
    call.mockReturnValueOnce(slow.promise)
    const stop = new AbortController()
    const pending = adapter.call(capability, { id: 'c1', name: 'list_tasks', input: { projectId: 'p1' } }, options(60_000, stop.signal))
    await tick()
    stop.abort(reason)
    expect(await pending).toEqual({ status: 'accepted', operationId: 'op-1' })
    slow.resolve({ tasks: [] })
    await tick()
    await tick()
    expect(rows.rows[0].state).toBe('COMPLETED')
    expect(rows.rows[0].end).toMatchObject({ state: 'COMPLETED', noReport: true })
    expect(call).toHaveBeenCalledOnce()
  })

  it('a turn lost to recovery, not cut by a person, still gets its report turn', async () => {
    const slow = deferred<unknown>()
    call.mockReturnValueOnce(slow.promise)
    const stop = new AbortController()
    const pending = adapter.call(capability, { id: 'c1', name: 'list_tasks', input: { projectId: 'p1' } }, options(60_000, stop.signal))
    await tick()
    stop.abort('lost')
    await pending
    slow.resolve({ tasks: [] })
    await tick()
    await tick()
    expect(rows.rows[0].end).not.toHaveProperty('noReport')
  })

  it('a detached call stopped meanwhile keeps its stopped end: the late result is abandoned', async () => {
    const slow = deferred<unknown>()
    call.mockReturnValueOnce(slow.promise)
    await adapter.call(capability, { id: 'c1', name: 'update_task', input: { taskId: 't1' } }, options(10))
    rows.rows[0].state = 'CANCELLED'
    slow.resolve({ success: true })
    await tick()
    await tick()
    expect(rows.rows[0].state).toBe('CANCELLED')
    expect(rows.rows[0].end).toBeUndefined()
  })

  it('once it has ended, the same call made again is a new call', async () => {
    await adapter.call(capability, { id: 'c1', name: 'list_tasks', input: { projectId: 'p1' } }, options())
    await adapter.call(capability, { id: 'c2', name: 'list_tasks', input: { projectId: 'p1' } }, options())
    expect(call).toHaveBeenCalledTimes(2)
    expect(rows.rows.map(r => r.id)).toEqual(['op-1', 'op-2'])
  })
})

describe('a task given by its key @SC-957', () => {
  const resolveTask = async <T,>(args: T): Promise<T> => {
    const given = (args as { taskId: string }).taskId
    if (given !== 'WAL-2') throw new ControlPlaneError('not_found', 'There is no task with the key or id "WAL-9"')
    return { ...args, taskId: 't2' }
  }

  it('is called, and keyed for idempotency, by the task\'s id', async () => {
    adapter = createToolAdapter({ rows, call, ask, settle, logError, resolveTask })
    await adapter.call(capability, { id: 'c1', name: 'get_task_details', input: { taskId: 'WAL-2' } }, options())
    expect(call).toHaveBeenCalledWith('get_task_details', capability, { taskId: 't2' })
    expect(rows.rows[0]!.key).toBe(idempotencyKey('get_task_details', { taskId: 't2' }))
  })

  it('is refused in the lookup\'s words when it names no task, with no row', async () => {
    adapter = createToolAdapter({ rows, call, ask, settle, logError, resolveTask })
    const outcome = await adapter.call(capability, { id: 'c1', name: 'get_task_details', input: { taskId: 'WAL-9' } }, options())
    expect(outcome).toEqual({ status: 'refused', reason: 'There is no task with the key or id "WAL-9"' })
    expect(rows.rows).toHaveLength(0)
    expect(call).not.toHaveBeenCalled()
  })
})

describe('a call refused before it starts leaves no row @SC-958', () => {
  it.each([
    ['a tool that starts work', 'run_task', { taskId: 't1' }],
    ["the data path's memory", 'remember', { scope: 'person', title: 'Tea', body: 'Prefers tea to coffee.', kind: 'preference' }],
    ['a name no tool has', 'drop_database', {}],
  ])('%s', async (_what, name, input) => {
    const outcome = await adapter.call(capability, { id: 'c1', name, input }, options())
    expect(outcome.status).toBe('refused')
    expect(rows.rows).toHaveLength(0)
    expect(call).not.toHaveBeenCalled()
  })

  it('arguments that do not fit the tool', async () => {
    const outcome = await adapter.call(capability, { id: 'c1', name: 'get_task_details', input: { taskId: 42 } }, options())
    expect(outcome).toMatchObject({ status: 'refused', reason: expect.stringContaining('taskId') })
    expect(rows.rows).toHaveLength(0)
  })

  it("a tool the agent may not use without asking, or at all", async () => {
    const limited = turnCapability({ permissions: { bypassed: false, allowedTools: [{ name: 'delete_task', state: 'never' }], allowedBashPatterns: [], neverTools: ['delete_task'] } })
    expect((await adapter.call(limited, { id: 'c1', name: 'delete_task', input: { taskId: 't1' } }, options())).status).toBe('refused')
    expect((await adapter.call(limited, { id: 'c2', name: 'list_tasks', input: { projectId: 'p1' } }, options())).status).toBe('refused')
    expect(rows.rows).toHaveLength(0)
  })

  it('a turn already stopped', async () => {
    const stop = new AbortController()
    stop.abort()
    expect((await adapter.call(capability, { id: 'c1', name: 'list_tasks', input: { projectId: 'p1' } }, options(50, stop.signal))).status).toBe('refused')
    expect(rows.rows).toHaveLength(0)
  })
})

describe('a call that only reads, which may run beside others in its step (#28) @SC-1838', () => {
  const asked = (name: string) => ({ id: 'c1', name, input: {} })

  it('is a read tool the turn calls as asked', () => {
    expect(adapter.readsOnly!(capability, asked('list_tasks'))).toBe(true)
    expect(adapter.readsOnly!(capability, asked('list_projects'))).toBe(true)
  })

  it('is never a call that writes, starts work, is the conversation\'s own, waits for approval or is refused', () => {
    for (const name of ['create_task', 'run_task', 'keep_listening', 'drop_database']) expect(adapter.readsOnly!(capability, asked(name))).toBe(false)
    const asking = turnCapability({ permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] } })
    expect(adapter.readsOnly!(asking, asked('list_tasks'))).toBe(false)
    expect(adapter.readsOnly!(turnCapability({ trigger: 'REPORT' }), asked('list_tasks'))).toBe(false)
  })
})

describe('the tools the lead is given @SC-958', () => {
  it("are the quick tools the agent may use in the place, without the ones that start work or the data path's", async () => {
    const names = (await adapter.toolsFor(capability)).map(t => t.name)
    expect(names).toEqual(expect.arrayContaining(['list_tasks', 'get_task_details', 'create_task', 'add_comment']))
    for (const absent of ['set_task_schedule', 'create_routine', 'update_routine', 'remember', 'forget', 'recall', 'start_app', 'tick_subtask', 'set_result']) {
      expect(names).not.toContain(absent)
    }
  })

  it("offer run_task and create_task as the conversation's own, which start work as an operation", async () => {
    const tools = await adapter.toolsFor(capability)
    expect(tools.filter(t => t.name === 'run_task')).toHaveLength(1)
    expect(tools.find(t => t.name === 'run_task')!.description).toMatch(/returns at once/)
    expect(tools.find(t => t.name === 'create_task')!.input.safeParse({ title: 't', projectId: 'p', orgId: 'o' }).success).toBe(false)
  })

  it('leave out what the agent may never use, and offer what it may use only by asking with a reason to give', async () => {
    const limited = turnCapability({ permissions: { bypassed: false, allowedTools: [{ name: 'list_tasks', state: 'always' }, { name: 'get_task_details', state: 'ask' }, { name: 'delete_task', state: 'never' }], allowedBashPatterns: [], neverTools: ['delete_task'] } })
    const tools = await adapter.toolsFor(limited)
    const asking = tools.filter(t => t.description.includes("approval first"))
    expect(tools.filter(t => !asking.includes(t)).map(t => t.name)).toEqual(['list_tasks'])
    expect(asking.map(t => t.name)).toEqual(expect.arrayContaining(['get_task_details', 'run_task', 'create_task']))
    expect(tools.map(t => t.name)).not.toContain('delete_task')
    const getTask = tools.find(t => t.name === 'get_task_details')!
    expect(getTask.input.safeParse({ taskId: 't1' }).success).toBe(false)
    expect(getTask.input.safeParse({ taskId: 't1', reason: 'to see what is left' }).success).toBe(true)
  })

  it('are only the reading tools for a turn that answers no one', async () => {
    const names = (await adapter.toolsFor(turnCapability({ actingUserId: null, readerUserId: 'u1' }))).map(t => t.name)
    expect(names).toContain('list_tasks')
    expect(names).not.toContain('create_task')
    expect(names).not.toContain('add_comment')
  })

  it('are none in a report turn, which speaks and starts no work, and a call it makes anyway is refused', async () => {
    const report = turnCapability({ actingUserId: null, readerUserId: 'u1', trigger: 'REPORT' })
    expect(await adapter.toolsFor(report)).toEqual([])
    expect(await adapter.call(report, { id: 'c1', name: 'list_tasks', input: { projectId: 'p1' } }, options())).toMatchObject({ status: 'refused' })
    expect(call).not.toHaveBeenCalled()
    expect(rows.rows).toHaveLength(0)
  })

  it('are the authorising person\'s in a continuation turn', async () => {
    const names = (await adapter.toolsFor(turnCapability({ trigger: 'CONTINUATION', continuationDepth: 1 }))).map(t => t.name)
    expect(names).toContain('create_task')
  })

  it('carry a description and a schema the call is checked against', async () => {
    const getTask = (await adapter.toolsFor(capability)).find(t => t.name === 'get_task_details')!
    expect(getTask.description).toMatch(/^Get a task's details, its comments and its attachments\. Each attachment has a reference/)
    expect(getTask.input.safeParse({ taskId: 't1' }).success).toBe(true)
    expect(getTask.input.safeParse({}).success).toBe(false)
  })
})

describe('a call of a tool at Ask @SC-959', () => {
  const asking = turnCapability({ permissions: { bypassed: false, allowedTools: [{ name: 'run_task', state: 'always' }, { name: 'update_task', state: 'ask' }, { name: 'create_task', state: 'ask' }], allowedBashPatterns: [], neverTools: [] } })

  it('does not run: it asks, with the reason apart from the arguments, and the lead is told it waits', async () => {
    const outcome = await adapter.call(asking, { id: 'c1', name: 'update_task', input: { taskId: 't1', title: 'New', reason: 'to rename it as asked' } }, options())
    expect(outcome).toEqual({ status: 'waitingApproval', operationId: 'asked-1' })
    expect(ask).toHaveBeenCalledExactlyOnceWith({ capability: asking, toolName: 'update_task', args: { taskId: 't1', title: 'New' }, reason: 'to rename it as asked' })
    expect(call).not.toHaveBeenCalled()
    expect(rows.rows).toHaveLength(0)
  })

  it('is refused without a reason, and asks nothing', async () => {
    const outcome = await adapter.call(asking, { id: 'c1', name: 'update_task', input: { taskId: 't1' } }, options())
    expect(outcome).toMatchObject({ status: 'refused', reason: expect.stringContaining('reason') })
    expect(ask).not.toHaveBeenCalled()
  })

  it("asks for the conversation's own tool at Ask, such as create_task, without running it", async () => {
    const input = { title: 'Fix it', projectId: 'p1', when: 'now', assignedAgentId: 'a1', workspaceId: null, reason: 'so it gets done today' }
    const outcome = await adapter.call(asking, { id: 'c1', name: 'create_task', input }, options())
    expect(outcome.status).toBe('waitingApproval')
    const { reason: _reason, ...args } = input
    expect(ask).toHaveBeenCalledExactlyOnceWith({ capability: asking, toolName: 'create_task', args, reason: 'so it gets done today' })
  })

  it('never asks for a tool at Never, nor for a turn that acts for no one', async () => {
    const never = turnCapability({ permissions: { bypassed: false, allowedTools: [{ name: 'update_task', state: 'never' }], allowedBashPatterns: [], neverTools: ['update_task'] } })
    expect((await adapter.call(never, { id: 'c1', name: 'update_task', input: { taskId: 't1', reason: 'x' } }, options())).status).toBe('refused')
    const noOne = { ...asking, actingUserId: null, readerUserId: 'u1' }
    expect((await adapter.call(noOne, { id: 'c2', name: 'update_task', input: { taskId: 't1', reason: 'x' } }, options())).status).toBe('refused')
    expect(ask).not.toHaveBeenCalled()
  })

  it('a tool at Always is still called directly', async () => {
    const outcome = await adapter.call(turnCapability(), { id: 'c1', name: 'update_task', input: { taskId: 't1' } }, options())
    expect(outcome.status).toBe('done')
    expect(ask).not.toHaveBeenCalled()
  })
})

describe('the idempotency key @SC-957', () => {
  it('is the same for the same arguments in any order, and differs for different ones', () => {
    expect(idempotencyKey('update_task', { taskId: 't1', title: 'A' })).toBe(idempotencyKey('update_task', { title: 'A', taskId: 't1' }))
    expect(idempotencyKey('update_task', { taskId: 't1', title: 'A' })).not.toBe(idempotencyKey('update_task', { taskId: 't1', title: 'B' }))
    expect(idempotencyKey('update_task', { taskId: 't1' })).not.toBe(idempotencyKey('archive_task', { taskId: 't1' }))
  })
})

describe('the action line of a call that completed @SC-1010', () => {
  function withActions() {
    const write = vi.fn(async () => undefined)
    const before = vi.fn(async () => null)
    adapter = createToolAdapter({ rows, call, ask, settle, logError, actions: { write, before } })
    return { write, before }
  }

  it('is written once the call is done, with its arguments and result', async () => {
    const { write } = withActions()
    call.mockResolvedValueOnce({ success: true, taskId: 't1' })
    await adapter.call(capability, { id: 'c1', name: 'update_task', input: { taskId: 't1' } }, options())
    expect(write).toHaveBeenCalledExactlyOnceWith(capability, 'update_task', { taskId: 't1' }, { success: true, taskId: 't1' }, null)
  })

  it('is not written for a refused call, nor for one detached past the wait limit', async () => {
    const { write } = withActions()
    call.mockRejectedValueOnce(new ControlPlaneError('forbidden', 'no'))
    await adapter.call(capability, { id: 'c1', name: 'update_task', input: { taskId: 't1' } }, options())
    call.mockReturnValueOnce(deferred<unknown>().promise)
    await adapter.call(capability, { id: 'c2', name: 'update_task', input: { taskId: 't2' } }, options(5))
    expect(write).not.toHaveBeenCalled()
  })

  it('never fails the call when the line cannot be written', async () => {
    const { write } = withActions()
    write.mockRejectedValueOnce(new Error('database down'))
    const outcome = await adapter.call(capability, { id: 'c1', name: 'update_task', input: { taskId: 't1' } }, options())
    expect(outcome.status).toBe('done')
    expect(logError).toHaveBeenCalledOnce()
  })
})
