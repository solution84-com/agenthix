/**
 * One turn of the lead (conversation layer spec, Inference turn; Failure, recovery and observability), with the
 * model, the tools, access and the record replaced: the reply streams and is committed as one message; a tool
 * call goes through the tool adapter with the wait limit; a failed turn keeps what it wrote and says why; a
 * stopped one keeps what was streamed, marked interrupted.
 */
import { describe, it, expect } from 'vitest'
import { ModelCallError } from '../../contract'
import { ControlPlaneError } from '../../../server/controlplane/types'
import { WAIT_LIMIT_MS } from '../../../shared/conversations/protocol'
import { runTurn } from '../turn'
import { access, claimed, harness, scriptedModel, usage } from './turnHarness'

describe('a turn that answers @SC-947', () => {
  it('streams its text with offsets, commits it as one AGENT message and records its end with usage', async () => {
    const model = scriptedModel([[{ type: 'text', text: 'Hello' }, { type: 'text', text: ' there' }, { type: 'finish', reason: 'stop', usage: usage(7) }]])
    const h = harness(model)
    const { running, live } = h.run()

    const outcome = await runTurn(h.deps, running)

    expect(outcome.state).toBe('COMPLETED')
    expect(h.deltas).toEqual([{ offset: 0, text: 'Hello' }, { offset: 5, text: ' there' }])
    expect(live.at(-1)).toBe('Hello there')
    expect(h.stored).toHaveLength(1)
    expect(h.stored[0]).toMatchObject({ role: 'AGENT', kind: 'TEXT', body: { text: 'Hello there' }, agentId: 'agent-1', turnId: 'turn-1' })
    expect(h.ended).toEqual([{ state: 'COMPLETED', usage: usage(7), contextTokens: 7, error: null, errorKind: null, at: expect.any(Date) }])
    expect(h.turnStates).toEqual(['RUNNING', 'COMPLETED'])
    expect(h.deps.record.firstToken).toHaveBeenCalledTimes(1)
    expect(model.requests[0]).toMatchObject({ access, cacheKey: 'conv-1' })
  })

  it('logs one line with the message-to-first-token time, the duration and the queued wait', async () => {
    const h = harness(scriptedModel([[{ type: 'text', text: 'Hi' }, { type: 'finish', reason: 'stop', usage: usage(1) }]]))
    await runTurn(h.deps, h.run().running)
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0]).toMatch(/turn turn-1 .*COMPLETED/)
    expect(h.logs[0]).toMatch(/first token \d+ ms after the message/)
    expect(h.logs[0]).toMatch(/queued 500 ms/)
  })

  it('on the first turn fixes the talking model and records the policy notice once, before the reply @SC-951', async () => {
    const h = harness(scriptedModel([[{ type: 'text', text: 'Hi' }, { type: 'finish', reason: 'stop', usage: usage(1) }]]))
    h.resolveAccess.mockResolvedValueOnce({ access, problem: null, offer: null, notice: 'Opus is not available here' })
    await runTurn(h.deps, h.run(claimed({ talkingModel: null, talkingProvider: null })).running)

    expect(h.resolveAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'conv-1' }), null)
    expect(h.fixTalkingAccess).toHaveBeenCalledWith('conv-1', access)
    expect(h.stored.map(m => m.kind)).toEqual(['NOTICE', 'TEXT'])
    expect(h.stored[0]).toMatchObject({ role: 'PLATFORM', body: { text: 'Opus is not available here' } })
  })

  it('records no notice when another turn fixed the model first @SC-951', async () => {
    const h = harness(scriptedModel([[{ type: 'text', text: 'Hi' }, { type: 'finish', reason: 'stop', usage: usage(1) }]]))
    h.resolveAccess.mockResolvedValueOnce({ access, problem: null, offer: null, notice: 'Opus is not available here' })
    h.fixTalkingAccess.mockResolvedValueOnce(false)
    await runTurn(h.deps, h.run(claimed({ talkingModel: null, talkingProvider: null })).running)
    expect(h.stored.map(m => m.kind)).toEqual(['TEXT'])
  })

  it('on a later turn asks for the access of the model it keeps @SC-951', async () => {
    const h = harness(scriptedModel([[{ type: 'finish', reason: 'stop', usage: usage(1) }]]))
    await runTurn(h.deps, h.run().running)
    expect(h.resolveAccess).toHaveBeenCalledWith(expect.anything(), { model: 'claude-sonnet-5', provider: 'anthropic', owner: 'user' })
    expect(h.fixTalkingAccess).not.toHaveBeenCalled()
  })

  it('records the notice once when the recorded access is gone and it falls back to another payer @SC-951', async () => {
    const h = harness(scriptedModel([[{ type: 'text', text: 'Hi' }, { type: 'finish', reason: 'stop', usage: usage(1) }]]))
    h.resolveAccess.mockResolvedValueOnce({ access, problem: null, offer: null, notice: 'Now on the organisation\'s key' })
    await runTurn(h.deps, h.run().running)
    expect(h.stored.map(m => m.kind)).toEqual(['NOTICE', 'TEXT'])
    expect(h.stored[0]).toMatchObject({ role: 'PLATFORM', body: { text: 'Now on the organisation\'s key' } })
  })
})

describe('a tool call in a turn', () => {
  it('goes through the tool adapter with the wait limit, and its result goes back to the model', async () => {
    const model = scriptedModel([
      [{ type: 'text', text: 'Let me look.' }, { type: 'tool-call', call: { id: 'c1', name: 'list_tasks', input: {} } }, { type: 'finish', reason: 'tool-calls', usage: usage(2) }],
      [{ type: 'text', text: 'You have none.' }, { type: 'finish', reason: 'stop', usage: usage(3) }],
    ])
    const h = harness(model, { list_tasks: { status: 'done', operationId: 'op-1', result: { tasks: [] } } })

    await runTurn(h.deps, h.run().running)

    expect(h.toolCall).toHaveBeenCalledWith(expect.objectContaining({ turnId: 'turn-1' }), { id: 'c1', name: 'list_tasks', input: {} }, expect.objectContaining({ waitLimitMs: WAIT_LIMIT_MS }))
    expect(model.requests[1]!.messages.slice(-2)).toEqual([
      { role: 'assistant', content: 'Let me look.', toolCalls: [{ id: 'c1', name: 'list_tasks', input: {} }] },
      { role: 'tool', toolCallId: 'c1', toolName: 'list_tasks', result: { tasks: [] } },
    ])
    expect(h.stored.map(m => m.kind)).toEqual(['TEXT'])
    expect(h.stored[0]!.body).toMatchObject({ text: 'Let me look.\n\nYou have none.' })
    expect(h.ended[0]!.usage).toEqual(usage(5))
  })

  it('writes an operation-started message when the call is detached, and the lead is told it was accepted', async () => {
    // With a quick lookup beside it, so the reply goes on (a step that only started work ends the reply).
    const model = scriptedModel([
      [
        { type: 'tool-call', call: { id: 'c1', name: 'get_task', input: { taskId: 't' } } },
        { type: 'tool-call', call: { id: 'c2', name: 'list_projects', input: {} } },
        { type: 'finish', reason: 'tool-calls', usage: usage(1) },
      ],
      [{ type: 'text', text: 'Still looking.' }, { type: 'finish', reason: 'stop', usage: usage(1) }],
    ])
    const h = harness(model, { get_task: { status: 'accepted', operationId: 'op-9' }, list_projects: { status: 'done', operationId: 'o', result: {} } })

    await runTurn(h.deps, h.run().running)

    expect(h.stored.map(m => m.kind)).toEqual(['OPERATION_STARTED', 'TEXT'])
    expect(h.stored[0]).toMatchObject({ role: 'AGENT', operationId: 'op-9', turnId: 'turn-1' })
    expect(h.operations).toEqual(['op-9:RUNNING'])
    expect(model.requests[1]!.messages.at(-2)).toEqual({ role: 'tool', toolCallId: 'c1', toolName: 'get_task', result: { operationId: 'op-9', status: 'accepted' } })
  })

  it('writes the operation-started line with the operation\'s own title, its state and the count, when a tool starts work', async () => {
    const model = scriptedModel([
      [{ type: 'tool-call', call: { id: 'c1', name: 'start_work', input: { brief: 'b' } } }, { type: 'finish', reason: 'tool-calls', usage: usage(1) }],
      [{ type: 'text', text: 'I have asked for it.' }, { type: 'finish', reason: 'stop', usage: usage(1) }],
    ])
    const h = harness(model, { start_work: { status: 'accepted', operationId: 'op-5' } }, {
      'op-5': { title: 'Review the README', state: 'QUEUED', boundaryName: 'Shop', outstanding: 2 },
    })
    await runTurn(h.deps, h.run().running)
    expect(h.stored[0]).toMatchObject({ kind: 'OPERATION_STARTED', body: { title: 'Review the README', boundaryName: 'Shop' }, operationId: 'op-5' })
    expect(h.deps.events.operation).toHaveBeenCalledWith({ conversationId: 'conv-1', operationId: 'op-5', state: 'QUEUED', title: 'Review the README', outstanding: 2 })
  })

  it('writes no second operation-started message for a call that is the same pending operation', async () => {
    const call = { id: 'c1', name: 'get_task', input: {} }
    const model = scriptedModel([
      [{ type: 'tool-call', call }, { type: 'finish', reason: 'tool-calls', usage: usage(1) }],
      [{ type: 'tool-call', call: { ...call, id: 'c2' } }, { type: 'finish', reason: 'tool-calls', usage: usage(1) }],
      [{ type: 'finish', reason: 'stop', usage: usage(1) }],
    ])
    const h = harness(model, { get_task: { status: 'accepted', operationId: 'op-9' } })
    await runTurn(h.deps, h.run().running)
    expect(h.stored.filter(m => m.kind === 'OPERATION_STARTED')).toHaveLength(1)
  })

  it('tells the lead a refusal in its own words', async () => {
    const model = scriptedModel([
      [{ type: 'tool-call', call: { id: 'c1', name: 'nope', input: {} } }, { type: 'finish', reason: 'tool-calls', usage: usage(1) }],
      [{ type: 'finish', reason: 'stop', usage: usage(1) }],
    ])
    const h = harness(model, { nope: { status: 'refused', reason: "you're not a member of Finance" } })
    await runTurn(h.deps, h.run().running)
    expect(model.requests[1]!.messages.at(-1)).toMatchObject({ result: { status: 'refused', reason: "you're not a member of Finance" } })
  })

  it('stops calling the model after its step limit', async () => {
    const loop = [{ type: 'tool-call' as const, call: { id: 'c', name: 'list_tasks', input: {} } }, { type: 'finish' as const, reason: 'tool-calls' as const, usage: usage(1) }]
    const model = scriptedModel([loop, loop, loop, loop, loop])
    const h = harness(model, { list_tasks: { status: 'done', operationId: 'op', result: {} } })
    const outcome = await runTurn(h.deps, h.run().running)
    expect(model.requests).toHaveLength(4)
    expect(outcome.state).toBe('COMPLETED')
  })
})

describe('a turn that fails @SC-948', () => {
  it('with no model access writes a FAILED message saying what is missing, and never calls the model', async () => {
    const model = scriptedModel([])
    const h = harness(model)
    h.resolveAccess.mockResolvedValueOnce({ access: null, problem: 'Add an Anthropic key in Settings.', offer: null })

    const outcome = await runTurn(h.deps, h.run().running)

    expect(outcome).toMatchObject({ state: 'FAILED', error: 'Add an Anthropic key in Settings.' })
    expect(h.stored).toHaveLength(1)
    expect(h.stored[0]).toMatchObject({ role: 'AGENT', kind: 'FAILED', body: { reason: 'Add an Anthropic key in Settings.' }, turnId: 'turn-1' })
    expect(model.requests).toHaveLength(0)
    expect(h.turnStates).toEqual(['RUNNING', 'FAILED'])
  })

  it('on a model error keeps the partial reply and gives the reason a person can act on', async () => {
    const model = scriptedModel([async function* () {
      yield { type: 'text', text: 'Half an ans' }
      throw new ModelCallError('auth', 'The Anthropic key was refused. Check it in Settings.')
    }])
    const h = harness(model)

    const outcome = await runTurn(h.deps, h.run().running)

    expect(outcome.state).toBe('FAILED')
    expect(h.stored).toHaveLength(1)
    expect(h.stored[0]).toMatchObject({ kind: 'FAILED', body: { reason: 'The Anthropic key was refused. Check it in Settings.', partialText: 'Half an ans' } })
    expect(h.ended[0]).toMatchObject({ state: 'FAILED', error: 'The Anthropic key was refused. Check it in Settings.', errorKind: 'auth' })
  })

  it("when the turn's authority cannot be minted, says why", async () => {
    const h = harness(scriptedModel([]))
    h.deps.mint = async () => { throw new ControlPlaneError('forbidden', 'The person this turn would act for is no longer in the organisation') }
    const outcome = await runTurn(h.deps, h.run().running)
    expect(outcome).toMatchObject({ state: 'FAILED', error: 'The person this turn would act for is no longer in the organisation' })
  })

  it('on an unexpected error says something went wrong, logs it, and writes no internal detail', async () => {
    const h = harness(scriptedModel([async function* () { yield { type: 'text', text: 'x' }; throw new Error('socket hang up at 10.0.0.1') }]))
    const outcome = await runTurn(h.deps, h.run().running)
    expect(outcome.state).toBe('FAILED')
    expect(JSON.stringify(h.stored)).not.toContain('10.0.0.1')
    expect(h.deps.logError).toHaveBeenCalled()
  })

  it('with no agent left says so', async () => {
    const h = harness(scriptedModel([]))
    const outcome = await runTurn(h.deps, h.run(claimed({ agentId: null })).running)
    expect(outcome.state).toBe('FAILED')
    expect(h.stored[0]!.kind).toBe('FAILED')
  })
})

describe('a turn that is stopped @SC-948', () => {
  it('keeps what was streamed as its message, marked interrupted, and ends cancelled', async () => {
    const controller = new AbortController()
    const model = scriptedModel([async function* (request) {
      yield { type: 'text', text: 'Partly' }
      controller.abort('stop')
      if (request.signal.aborted) throw new ModelCallError('cancelled', 'The reply was stopped.')
    }])
    const h = harness(model)

    const outcome = await runTurn(h.deps, h.run(claimed(), controller).running)

    expect(outcome.state).toBe('CANCELLED')
    expect(h.stored).toHaveLength(1)
    expect(h.stored[0]).toMatchObject({ kind: 'TEXT', body: { text: 'Partly' }, interrupted: true })
    expect(h.ended[0]).toMatchObject({ state: 'CANCELLED', error: null })
    expect(h.turnStates).toEqual(['RUNNING', 'CANCELLED'])
  })

  it('stopped before it said anything, still leaves its mark: an empty reply marked interrupted (walkthrough finding 39)', async () => {
    const controller = new AbortController()
    const model = scriptedModel([async function* (request) {
      controller.abort('stop')
      if (request.signal.aborted) throw new ModelCallError('cancelled', 'The reply was stopped.')
      yield { type: 'text', text: 'never' }
    }])
    const h = harness(model)

    const outcome = await runTurn(h.deps, h.run(claimed(), controller).running)

    expect(outcome.state).toBe('CANCELLED')
    expect(h.stored).toHaveLength(1)
    expect(h.stored[0]).toMatchObject({ kind: 'TEXT', role: 'AGENT', body: { text: '' }, interrupted: true, turnId: 'turn-1' })
  })

  it('marks its reply withdrawn when the person\'s spoken words joined the message it answered', async () => {
    const controller = new AbortController()
    const model = scriptedModel([async function* (request) {
      controller.abort('interrupt')
      if (request.signal.aborted) throw new ModelCallError('cancelled', 'The reply was stopped.')
      yield { type: 'text', text: 'never' }
    }])
    const h = harness(model)
    h.deps.voice = { begin: () => ({ text: () => undefined, end: () => ({ text: '', interrupted: true, withdrawn: true }) }) }

    await runTurn(h.deps, h.run(claimed(), controller).running)

    expect(h.stored[0]).toMatchObject({ kind: 'TEXT', body: { text: '' }, interrupted: true, withdrawn: true })
  })

  it('marks a reply that only asks the person to go on, and leaves its mark out', async () => {
    const h = harness(scriptedModel([async function* () { yield { type: 'text', text: ':::encouragement\nMm? Go on.' } }]))
    await runTurn(h.deps, h.run(claimed()).running)
    expect(h.stored[0]).toMatchObject({ kind: 'TEXT', body: { text: 'Mm? Go on.' }, encouragement: true })
  })

  it('asks for the conversation to be named from the reply, once it has ended', async () => {
    const h = harness(scriptedModel([async function* () { yield { type: 'text', text: 'Let us plan it.' } }]))
    const asked: string[] = []
    h.deps.titleConversation = async (_id, _access, reply) => { asked.push(reply) }
    await runTurn(h.deps, h.run(claimed()).running)
    expect(asked).toEqual(['Let us plan it.'])
  })

  it('writes nothing once it has lost the lock: the turn is no longer its own', async () => {
    const controller = new AbortController()
    const model = scriptedModel([async function* () {
      yield { type: 'text', text: 'Partly' }
      controller.abort('lost')
      throw new ModelCallError('cancelled', 'The reply was stopped.')
    }])
    const h = harness(model)
    const outcome = await runTurn(h.deps, h.run(claimed(), controller).running)
    expect(outcome.state).toBe('FAILED')
    expect(h.stored).toHaveLength(0)
    expect(h.ended).toHaveLength(0)
  })

  it('writes no message when recovery ended the turn first', async () => {
    const h = harness(scriptedModel([[{ type: 'text', text: 'late' }, { type: 'finish', reason: 'stop', usage: usage(1) }]]))
    h.refuseFinish()
    await runTurn(h.deps, h.run().running)
    expect(h.stored).toHaveLength(0)
  })
})

describe('a turn that answers no person', () => {
  it('is minted as a report, for no one, and says what it said', async () => {
    const h = harness(scriptedModel([[{ type: 'text', text: 'Three things are back.' }, { type: 'finish', reason: 'stop', usage: usage(1) }]]))
    const outcome = await runTurn(h.deps, h.run({ ...claimed(), trigger: 'REPORT', actingUserId: null }).running)
    expect(h.deps.mint).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'REPORT', actingUserId: null }))
    expect(h.deps.context).toHaveBeenCalledWith(expect.anything(), 'agent-1', expect.objectContaining({ trigger: 'REPORT' }))
    expect(outcome).toEqual({ state: 'COMPLETED', error: null, text: 'Three things are back.' })
  })

  it('is minted as a continuation with the depth of the obligation it carries out', async () => {
    const h = harness(scriptedModel([[{ type: 'finish', reason: 'stop', usage: usage(1) }]]))
    await runTurn(h.deps, h.run({ ...claimed(), trigger: 'CONTINUATION', continuationDepth: 2 }).running)
    expect(h.deps.mint).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'CONTINUATION', actingUserId: 'u1', continuationDepth: 2 }))
  })
})
