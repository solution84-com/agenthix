/**
 * A reply's steps (walkthrough findings 24 and 25): a step's tools run together, results in the order asked; each
 * step is timed and kept with the reply; and the step cap never ends a reply without a word. A reply that runs
 * long: moveToBackground.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'
import type { ToolCallOutcome } from '../../contract'
import { runTurn } from '../turn'
import { STOPPED_WITHOUT_ANSWER } from '../moveToBackground'
import { leadMessages } from '../context'
import { claimed, harness, scriptedModel, usage, type Step } from './turnHarness'

const finish = (reason: 'stop' | 'tool-calls') => ({ type: 'finish' as const, reason, usage: usage(1) })
const ask = (...calls: { id: string; name: string; input?: unknown }[]): Step =>
  [...calls.map(c => ({ type: 'tool-call' as const, call: { input: {}, ...c } })), finish('tool-calls')]
const say = (text: string): Step => [{ type: 'text', text }, finish('stop')]
const lookup = (n: number): Step => ask({ id: `c${n}`, name: 'list_projects' })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

describe("a step's tools @SC-1005", () => {
  it('run at once, a slow one not holding the others, and go back to the model in the order asked', async () => {
    const model = scriptedModel([ask({ id: 'a', name: 'list_tasks' }, { id: 'b', name: 'list_projects' }), say('Done.')])
    const h = harness(model)
    const slow = deferred<ToolCallOutcome>()
    const started: string[] = []
    h.toolCall.mockImplementation(async (_c, call) => {
      started.push(call.name)
      if (call.name === 'list_tasks') return slow.promise
      // The quick one is back while the slow one still runs; only then is the slow one let go.
      setTimeout(() => slow.resolve({ status: 'done', operationId: 'op-a', result: { tasks: [] } }), 0)
      return { status: 'done', operationId: 'op-b', result: { projects: [] } }
    })

    await runTurn(h.deps, h.run().running)

    expect(started).toEqual(['list_tasks', 'list_projects'])
    expect(model.requests[1]!.messages.slice(-2)).toEqual([
      { role: 'tool', toolCallId: 'a', toolName: 'list_tasks', result: { tasks: [] } },
      { role: 'tool', toolCallId: 'b', toolName: 'list_projects', result: { projects: [] } },
    ])
  })

  it('run once when the same call is asked twice in one step, each asking given its result', async () => {
    const model = scriptedModel([ask({ id: 'a', name: 'list_projects' }, { id: 'b', name: 'list_projects' }), say('Done.')])
    const h = harness(model, { list_projects: { status: 'done', operationId: 'op', result: { projects: [] } } })
    await runTurn(h.deps, h.run().running)
    expect(h.toolCall).toHaveBeenCalledTimes(1)
    expect(model.requests[1]!.messages.slice(-2).map(m => (m as { toolCallId: string }).toolCallId)).toEqual(['a', 'b'])
  })

  it('that start work show it in the thread in the order asked', async () => {
    const model = scriptedModel([ask({ id: 'a', name: 'start_work', input: { title: 'One' } }, { id: 'b', name: 'start_work', input: { title: 'Two' } }), say('Started both.')])
    const h = harness(model, {}, { 'op-1': { title: 'One', state: 'QUEUED', outstanding: 1 }, 'op-2': { title: 'Two', state: 'QUEUED', outstanding: 2 } })
    let started = 0
    h.toolCall.mockImplementation(async () => ({ status: 'accepted', operationId: `op-${++started}` }))
    await runTurn(h.deps, h.run().running)
    expect(h.stored.filter(m => m.kind === 'OPERATION_STARTED').map(m => m.operationId)).toEqual(['op-1', 'op-2'])
  })
})

describe("a reply's steps @SC-1005", () => {
  it('are kept with the reply, each in words with its time, and how long the reply worked', async () => {
    const model = scriptedModel([
      ask({ id: 'a', name: 'list_projects' }, { id: 'b', name: 'list_tasks', input: { projectId: 'p1' } }),
      ask({ id: 'c', name: 'run_task', input: { taskId: 'WAL-2' } }),
      say('Started it.'),
    ])
    const h = harness(model, {
      list_projects: { status: 'done', operationId: 'o1', result: {} },
      list_tasks: { status: 'done', operationId: 'o2', result: { tasks: [] } },
      run_task: { status: 'refused', reason: 'Task WAL-2 not found' },
    })
    h.deps.stepNames = { project: async id => (id === 'p1' ? 'Walkthrough' : null) }

    await runTurn(h.deps, h.run().running)

    const reply = h.stored.find(m => m.kind === 'TEXT')!
    const thinking = (reply.body as { thinking?: { ms: number; steps: { label: string; ms: number; failed?: boolean }[] } }).thinking!
    expect(thinking.steps.map(s => s.label)).toEqual(["Looked at your projects and Walkthrough's tasks", "Couldn't run WAL-2: nothing has that name"])
    expect(thinking.steps[1]!.failed).toBe(true)
    expect(thinking.steps[0]!.failed).toBeUndefined()
    for (const step of thinking.steps) expect(step.ms).toBeGreaterThan(0)
    expect(thinking.ms).toBeGreaterThanOrEqual(thinking.steps[0]!.ms + thinking.steps[1]!.ms)
  })

  it('are sent live as each starts and ends, never naming a tool', async () => {
    const model = scriptedModel([lookup(1), say('Two.')])
    const h = harness(model, { list_projects: { status: 'done', operationId: 'o', result: {} } })
    const live: unknown[] = []
    const { running } = h.run()
    running.onSteps = l => { live.push(l) }

    await runTurn(h.deps, running)

    expect(h.steps.map(e => e.steps)).toEqual([[{ label: 'Looking at your projects' }], [{ label: 'Looked at your projects', ms: expect.any(Number) }]])
    expect(h.steps.every(e => e.conversationId === 'conv-1' && e.turnId === 'turn-1' && e.elapsedMs > 0)).toBe(true)
    expect(live).toHaveLength(2)
    expect(JSON.stringify(h.steps)).not.toContain('list_projects')
  })

  it('are none for a plain answer, and for a step that only says which memories it used', async () => {
    const plain = harness(scriptedModel([say('Hi.')]))
    await runTurn(plain.deps, plain.run().running)
    expect(plain.stored[0]!.body).toEqual({ text: 'Hi.' })

    const memory = harness(scriptedModel([[{ type: 'text', text: 'Hi.' }, { type: 'tool-call', call: { id: 'm', name: 'used_memory', input: { keys: [] } } }, finish('tool-calls')]]))
    await runTurn(memory.deps, memory.run().running)
    expect(memory.stored[0]!.body).toEqual({ text: 'Hi.' })
    expect(memory.steps).toEqual([])
  })
})

describe('a step that only starts work (walkthrough finding 31) @SC-968', () => {
  const op = (id: string) => ({ [id]: { title: id, state: 'QUEUED' as const, outstanding: 1 } })

  it("ends the reply there, with no further model call, and hq's line naming the work when the model wrote none", async () => {
    const model = scriptedModel([ask({ id: 'a', name: 'start_work', input: { title: 'List my space' } }, { id: 'b', name: 'run_task', input: { taskId: 'WAL-2' } }), say('Never asked.')])
    const h = harness(model, {}, { ...op('op-1'), ...op('op-2') })
    h.toolCall.mockImplementation(async (_c, call) => (call.name === 'start_work' ? { status: 'accepted', operationId: 'op-1' } : { status: 'waitingApproval', operationId: 'op-2' }))

    const outcome = await runTurn(h.deps, h.run().running)

    expect(model.requests).toHaveLength(1)
    expect(outcome).toMatchObject({ state: 'COMPLETED', text: "I've started: op-1, and asked for your okay to start: op-2." })
    expect(h.stored.map(m => m.kind)).toEqual(['OPERATION_STARTED', 'TEXT'])
    expect(h.stored[1]).toMatchObject({ role: 'AGENT', turnId: 'turn-1' })
    expect(h.turnStates).toEqual(['RUNNING', 'COMPLETED'])
  })

  it("keeps the reply's steps and time on hq's line, a step for each piece it started", async () => {
    const model = scriptedModel([ask({ id: 'a', name: 'start_work' }, { id: 'b', name: 'start_work', input: { title: 'Two' } })])
    const h = harness(model, {}, {
      'op-1': { title: 'List every file in my space', state: 'QUEUED', boundaryName: 'your space', outstanding: 1 },
      'op-2': { title: 'List every file in Walkthrough', state: 'QUEUED', boundaryName: 'Walkthrough', outstanding: 2 },
    })
    let n = 0
    h.toolCall.mockImplementation(async () => ({ status: 'accepted', operationId: `op-${++n}` }))

    await runTurn(h.deps, h.run().running)

    const reply = h.stored.find(m => m.kind === 'TEXT')!
    const body = reply.body as { text: string; thinking: { ms: number; steps: { label: string; made?: string }[] } }
    expect(body.text).toBe("I've started: List every file in my space; List every file in Walkthrough.")
    expect(body.thinking.ms).toBeGreaterThan(0)
    expect(body.thinking.steps).toEqual([
      { label: 'Started "List every file in my space" · your space', ms: expect.any(Number), made: 'started' },
      { label: 'Started "List every file in Walkthrough" · Walkthrough', ms: expect.any(Number), made: 'started' },
    ])
  })

  it("names a task set for a time, and when it starts in the person's timezone", async () => {
    const model = scriptedModel([ask({ id: 'a', name: 'create_task', input: { title: 'Morning check' } })])
    const h = harness(model, { create_task: { status: 'accepted', operationId: 'op-4' } }, {
      'op-4': { title: 'WAL-4 Morning check', state: 'COMPLETED', boundaryName: 'Walkthrough', startsAt: new Date('2026-10-17T22:00:00Z'), outstanding: 0 },
    })
    h.deps.timezone = async () => 'Australia/Sydney'

    const outcome = await runTurn(h.deps, h.run().running)

    expect(outcome.text).toBe("I've set WAL-4 Morning check to start Sun 18 Oct, 9:00.")
    const steps = (h.stored.find(m => m.kind === 'TEXT')!.body as { thinking: { steps: unknown[] } }).thinking.steps
    expect(steps).toEqual([{ label: 'Set "WAL-4 Morning check" to start Sun 18 Oct, 9:00', ms: expect.any(Number), made: 'set' }])
  })

  it('writes a task set for a time as done in the turn: its card carries when it starts, and nothing is left live', async () => {
    const model = scriptedModel([ask({ id: 'a', name: 'create_task', input: { title: 'Morning check' } })])
    const h = harness(model, { create_task: { status: 'accepted', operationId: 'op-4' } }, {
      'op-4': { title: 'WAL-4 Morning check', state: 'COMPLETED', boundaryName: 'Walkthrough', startsAt: new Date('2026-10-17T22:00:00Z'), outstanding: 0 },
    })
    const ledger = { record: vi.fn(async () => {}) }
    h.deps.ledger = ledger

    await runTurn(h.deps, h.run().running)

    const card = h.stored.find(m => m.kind === 'OPERATION_STARTED')!
    expect(card.body).toEqual({ title: 'WAL-4 Morning check', boundaryName: 'Walkthrough', startsAt: '2026-10-17T22:00:00.000Z' })
    // Not open work: nothing for the ledger to keep, and no live operation for the screens.
    expect(ledger.record).not.toHaveBeenCalled()
    expect(h.operations).toEqual([])
  })

  it('keeps the words the model wrote in that same step, and adds none', async () => {
    const model = scriptedModel([[{ type: 'text', text: 'On it.' }, ...(ask({ id: 'a', name: 'start_work' }) as never[])], say('Never asked.')])
    const h = harness(model, { start_work: { status: 'accepted', operationId: 'op-1' } }, op('op-1'))

    const outcome = await runTurn(h.deps, h.run().running)

    expect(model.requests).toHaveLength(1)
    expect(outcome.text).toBe('On it.')
    expect(h.stored.map(m => m.kind)).toEqual(['OPERATION_STARTED', 'TEXT'])
  })

  it('is read back next turn, so the agent does not do it again (walkthrough finding 34)', async () => {
    const model = scriptedModel([ask({ id: 'a', name: 'start_work' })])
    const h = harness(model, { start_work: { status: 'accepted', operationId: 'op-1' } }, {
      'op-1': { title: 'Read every file', state: 'QUEUED', boundaryName: 'your space', outstanding: 1 },
    })
    await runTurn(h.deps, h.run().running)

    const asked = { id: 'm1', seq: 1, clientMessageId: null, role: 'PERSON', authorId: 'u1', agentId: null, kind: 'TEXT', body: { text: 'Read every file in my space' }, spoken: false, interrupted: false, operationId: null, turnId: 'turn-1', queueState: null, createdAt: '' }
    const again = { ...asked, id: 'm2', seq: 99, body: { text: 'and then?' }, turnId: null }
    const { messages } = leadMessages([asked, ...h.stored, again] as never, ['m2'])
    expect(messages[1]).toEqual({ role: 'assistant', content: `I've started: Read every file.\n\n[Record: started "Read every file" · your space]` })
  })

  it('carries on when the step also looked something up, or a call was refused', async () => {
    const mixed = scriptedModel([ask({ id: 'a', name: 'start_work' }, { id: 'b', name: 'list_projects' }), say('Started, and here are your projects.')])
    const h = harness(mixed, { start_work: { status: 'accepted', operationId: 'op-1' }, list_projects: { status: 'done', operationId: 'o', result: {} } }, op('op-1'))
    await runTurn(h.deps, h.run().running)
    expect(mixed.requests).toHaveLength(2)

    const refused = scriptedModel([ask({ id: 'a', name: 'start_work' }, { id: 'b', name: 'run_task' }), say('One could not start.')])
    const r = harness(refused, { start_work: { status: 'accepted', operationId: 'op-1' }, run_task: { status: 'refused', reason: 'no' } }, op('op-1'))
    await runTurn(r.deps, r.run().running)
    expect(refused.requests).toHaveLength(2)
  })

  it('carries on after a lookup that detached past the wait limit, or one waiting for an okay: neither starts work', async () => {
    const detached = scriptedModel([ask({ id: 'a', name: 'get_task_details', input: { taskId: 'WAL-2' } }), say("That's taking a moment.")])
    const h = harness(detached, { get_task_details: { status: 'accepted', operationId: 'op-9' } })
    const outcome = await runTurn(h.deps, h.run().running)
    expect(detached.requests).toHaveLength(2)
    expect(outcome.text).toBe("That's taking a moment.")

    const asking = scriptedModel([ask({ id: 'a', name: 'update_task', input: { taskId: 'WAL-2' } }), say('I need your okay to change WAL-2.')])
    const a = harness(asking, { update_task: { status: 'waitingApproval', operationId: 'op-8' } })
    await runTurn(a.deps, a.run().running)
    expect(asking.requests).toHaveLength(2)
  })

  it('ignores which memories it used when deciding', async () => {
    const model = scriptedModel([ask({ id: 'a', name: 'start_work' }, { id: 'm', name: 'used_memory', input: { keys: [] } }), say('Never asked.')])
    const h = harness(model, { start_work: { status: 'accepted', operationId: 'op-1' }, used_memory: { status: 'done', operationId: 'o', result: {} } }, op('op-1'))
    await runTurn(h.deps, h.run().running)
    expect(model.requests).toHaveLength(1)
  })
})

describe('the step cap @SC-947', () => {
  it('makes the last call words only, and a reply that still says nothing is never silent', async () => {
    const model = scriptedModel([lookup(1), lookup(2), lookup(3), lookup(4)])
    const h = harness(model, { list_projects: { status: 'done', operationId: 'o', result: {} } })
    h.deps.moveAfterSteps = 100

    const outcome = await runTurn(h.deps, h.run(claimed()).running)

    expect(model.requests).toHaveLength(4)
    expect(model.requests[3]!.toolChoice).toBe('none')
    expect(h.toolCall).toHaveBeenCalledTimes(3)
    expect(outcome).toMatchObject({ state: 'COMPLETED', text: STOPPED_WITHOUT_ANSWER })
    expect(h.stored.at(-1)).toMatchObject({ kind: 'TEXT', body: { text: STOPPED_WITHOUT_ANSWER } })
  })
})

describe('words that say work started when no call started it (walkthrough finding 38) @SC-968', () => {
  const startTools = (h: ReturnType<typeof harness>) => {
    h.deps.tools.toolsFor = async () => [{ name: 'start_work', description: '', input: {} as never }]
  }

  it('get one more step, told plainly that nothing started, to make the call or correct itself', async () => {
    const model = scriptedModel([say('Starting a fresh read of your space now.'), ask({ id: 'a', name: 'start_work' })])
    const h = harness(model, { start_work: { status: 'accepted', operationId: 'op-1' } }, {
      'op-1': { title: 'Read every file', state: 'QUEUED', boundaryName: 'your space', outstanding: 1 },
    })
    startTools(h)

    await runTurn(h.deps, h.run().running)

    expect(model.requests).toHaveLength(2)
    const [said, note] = model.requests[1]!.messages.slice(-2)
    expect(said).toEqual({ role: 'assistant', content: 'Starting a fresh read of your space now.' })
    expect(note).toMatchObject({ role: 'user', content: expect.stringMatching(/no call that starts it, so nothing has started/) })
    expect(h.stored.filter(m => m.kind === 'OPERATION_STARTED').map(m => m.operationId)).toEqual(['op-1'])
  })

  it('get that step only once', async () => {
    const model = scriptedModel([say("I'm starting the read now."), say("I'm starting it now."), say('Never asked.')])
    const h = harness(model)
    startTools(h)
    await runTurn(h.deps, h.run().running)
    expect(model.requests).toHaveLength(2)
  })

  it('end the reply as before when the reply did start work, or no tool here can start any', async () => {
    const started = scriptedModel([ask({ id: 'a', name: 'start_work' }, { id: 'b', name: 'list_projects' }), say("I've started it, and you have two projects.")])
    const h = harness(started, { start_work: { status: 'accepted', operationId: 'op-1' }, list_projects: { status: 'done', operationId: 'o', result: {} } }, {
      'op-1': { title: 'Read', state: 'QUEUED', outstanding: 1 },
    })
    startTools(h)
    await runTurn(h.deps, h.run().running)
    expect(started.requests).toHaveLength(2)

    const none = scriptedModel([say("I'm starting the read now."), say('Never asked.')])
    const quiet = harness(none)
    await runTurn(quiet.deps, quiet.run().running)
    expect(none.requests).toHaveLength(1)
  })
})

